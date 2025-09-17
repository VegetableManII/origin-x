import Taro from '@tarojs/taro'
import { RequestService } from '../utils/request'

// 充值请求参数
export interface RechargeRequest {
  payEntrypoint: 'MiniAppPay' | 'H5Pay'
  payPlatform: 'wechat' | 'alipay'
  attach: string
  amount: number // 单位为分
}

// H5充值响应数据
export interface H5RechargeResponse {
  orderId: string
  h5: {
    url: string
  }
}

// 小程序充值响应数据
export interface MiniAppRechargeResponse {
  orderId: string
  miniapp: {
    appid: string
    path: string
  }
}

// 充值响应数据（联合类型）
export type RechargeResponse = H5RechargeResponse | MiniAppRechargeResponse

// 支付状态查询请求参数
export interface PaymentStatusRequest {
  orderId: string // 订单ID，用于查询支付状态
}

// 支付状态查询响应
export interface PaymentStatusResponse {
  orderId: string
  amount: number
  description: string
  createTime: string
  payTime?: string // 支付时间，如果未支付则为空
  attach: string
}

// 充值服务类
export class RechargeService {
  /**
   * 发起充值请求
   * @param params 充值参数
   * @returns 充值响应数据
   */
  static async createRecharge(params: RechargeRequest): Promise<RechargeResponse> {
    try {
      const response = await RequestService.post<RechargeResponse>('/users/recharge', params)
      return response
    } catch (error) {
      console.error('充值请求失败:', error)
      throw error
    }
  }

  /**
   * 查询支付状态
   * @param params 查询参数
   * @returns 支付状态
   */
  static async getPaymentStatus(params: PaymentStatusRequest): Promise<PaymentStatusResponse> {
    try {
      const response = await RequestService.get<PaymentStatusResponse>('/users/recharge/status', {
        data: params
      })
      return response
    } catch (error) {
      console.error('查询支付状态失败:', error)
      throw error
    }
  }

  /**
   * 生成唯一的附加信息
   * @returns 唯一串
   */
  static generateAttach(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 10)
    return `${timestamp}_${random}`
  }

  /**
   * 判断当前环境的支付入口点
   * @returns 支付入口点
   */
  static getPayEntrypoint(): 'MiniAppPay' | 'H5Pay' {
    const env = Taro.getEnv()
    return env === Taro.ENV_TYPE.WEAPP ? 'MiniAppPay' : 'H5Pay'
  }

  /**
   * 处理支付跳转
   * @param response 充值响应数据
   * @returns Promise<void>
   */
  static async handlePaymentRedirect(response: RechargeResponse): Promise<void> {
    const env = Taro.getEnv()

    if (env === Taro.ENV_TYPE.WEB) {
      // H5环境 - 直接跳转到支付页面
      const h5Response = response as H5RechargeResponse
      if (h5Response.h5?.url) {
        // 在当前页面跳转到支付页面
        window.location.href = h5Response.h5.url
      } else {
        throw new Error('支付URL获取失败')
      }
    } else if (env === Taro.ENV_TYPE.WEAPP) {
      // 小程序环境 - 跳转到支付小程序
      const miniappResponse = response as MiniAppRechargeResponse
      if (miniappResponse.miniapp?.appid && miniappResponse.miniapp?.path) {
        try {
          await Taro.navigateToMiniProgram({
            appId: miniappResponse.miniapp.appid,
            path: miniappResponse.miniapp.path,
            extraData: {},
            envVersion: 'release'
          })
          // 小程序跳转成功，不需要额外处理
          // 用户完成支付后会自动回到当前小程序，由onShow事件处理支付结果查询
        } catch (error) {
          // 跳转失败，可能是用户取消或其他原因
          console.error('跳转支付小程序失败:', error)
          throw new Error('跳转支付页面失败，请重试')
        }
      } else {
        throw new Error('小程序支付参数获取失败')
      }
    } else {
      throw new Error('当前环境不支持支付')
    }
  }

  /**
   * 启动支付状态轮询
   * @param orderId 订单ID
   * @param expectedAttach 本地保存的attach，用于校验订单安全性
   * @param options 轮询选项
   * @returns 清理函数
   */
  static startPaymentPolling(
    orderId: string,
    expectedAttach: string,
    options: {
      onSuccess?: (result: PaymentStatusResponse) => void
      onFailed?: (result: PaymentStatusResponse) => void
      onTimeout?: () => void
      maxAttempts?: number
      interval?: number
    } = {}
  ): () => void {
    const {
      onSuccess,
      onFailed,
      onTimeout,
      maxAttempts = 60, // 最多轮询60次
      interval = 2000 // 每2秒轮询一次
    } = options

    let attempts = 0
    let isPolling = true
    let timeoutId: NodeJS.Timeout | null = null

    const poll = async () => {
      if (!isPolling) return

      attempts++

      try {
        const result = await this.getPaymentStatus({
          orderId
        })

        // 检查是否支付完成（所有字段都不为空）
        const isPaymentComplete = result.amount &&
                                 result.description &&
                                 result.createTime &&
                                 result.payTime &&
                                 result.attach

        // 如果支付完成，校验attach是否匹配
        if (isPaymentComplete) {
          if (result.attach !== expectedAttach) {
            console.error('订单校验失败：attach不匹配', {
              expected: expectedAttach,
              received: result.attach
            })
            isPolling = false
            onFailed?.({
              orderId: result.orderId,
              amount: result.amount,
              description: '订单校验失败',
              createTime: result.createTime,
              attach: result.attach
            })
            return
          }

          // 支付成功
          isPolling = false
          onSuccess?.(result)
          return
        }

        // 任何字段为空都表示等待支付，继续轮询

        if (attempts >= maxAttempts) {
          isPolling = false
          onTimeout?.()
          return
        }

        // 继续轮询
        if (isPolling) {
          timeoutId = setTimeout(poll, interval)
        }
      } catch (error) {
        console.error('支付状态查询失败:', error)

        // 如果是网络错误或暂时性错误，继续轮询
        if (attempts < maxAttempts && isPolling) {
          timeoutId = setTimeout(poll, interval)
        } else {
          isPolling = false
          onFailed?.({
            status: 'failed',
            message: '支付状态查询失败'
          })
        }
      }
    }

    // 开始轮询
    timeoutId = setTimeout(poll, interval)

    // 返回清理函数
    return () => {
      isPolling = false
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
  }
}