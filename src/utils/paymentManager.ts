import Taro from '@tarojs/taro'
import { RechargeService, PaymentStatusResponse } from '../services/recharge'

// 支付管理器状态
interface PaymentState {
  orderId: string
  attach: string
  amount: number
  isPolling: boolean
  pollingCleanup?: () => void
  visibilityChangeHandler?: () => void
  callbacks?: {
    onSuccess?: (result: PaymentStatusResponse) => void
    onFailed?: (result: PaymentStatusResponse) => void
    onTimeout?: () => void
  }
}

// 支付管理器类
export class PaymentManager {
  private static instance: PaymentManager
  private state: PaymentState | null = null

  private constructor() {}

  static getInstance(): PaymentManager {
    if (!PaymentManager.instance) {
      PaymentManager.instance = new PaymentManager()
    }
    return PaymentManager.instance
  }

  /**
   * 开始支付流程
   * @param orderId 订单ID
   * @param attach 附加信息
   * @param amount 支付金额（分）
   * @param callbacks 回调函数
   */
  startPayment(
    orderId: string,
    attach: string,
    amount: number,
    callbacks: {
      onSuccess?: (result: PaymentStatusResponse) => void
      onFailed?: (result: PaymentStatusResponse) => void
      onTimeout?: () => void
    } = {}
  ): void {
    // 清理之前的状态
    this.cleanup()

    // 设置新状态
    this.state = {
      orderId,
      attach,
      amount,
      isPolling: true
    }

    // 在H5环境下监听页面可见性变化
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      this.setupVisibilityChangeHandler(callbacks)
    }

    // 在小程序环境下监听onShow事件
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      this.setupAppShowHandler(callbacks)
    }

    console.log('支付流程已开始，等待用户支付完成后返回...')
  }

  /**
   * 设置H5页面可见性变化处理器
   */
  private setupVisibilityChangeHandler(callbacks: {
    onSuccess?: (result: PaymentStatusResponse) => void
    onFailed?: (result: PaymentStatusResponse) => void
    onTimeout?: () => void
  }): void {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      // 当页面重新变为可见时，开始轮询支付状态
      if (!document.hidden && this.state && this.state.isPolling) {
        console.log('页面重新可见，开始查询支付状态...')
        this.startPolling(callbacks)
      }
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange)
    this.state!.visibilityChangeHandler = handleVisibilityChange

    // 监听页面焦点变化（备用方案）
    const handleFocus = () => {
      if (this.state && this.state.isPolling) {
        console.log('页面重新获得焦点，开始查询支付状态...')
        this.startPolling(callbacks)
      }
    }

    window.addEventListener('focus', handleFocus)

    // 保存清理函数
    const originalCleanup = this.state!.visibilityChangeHandler
    this.state!.visibilityChangeHandler = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      if (originalCleanup) originalCleanup()
    }
  }

  /**
   * 设置小程序onShow事件处理器
   */
  private setupAppShowHandler(callbacks: {
    onSuccess?: (result: PaymentStatusResponse) => void
    onFailed?: (result: PaymentStatusResponse) => void
    onTimeout?: () => void
  }): void {
    // 小程序环境下，用户从支付小程序返回后会触发onShow事件
    // 这里不启动轮询，等待onShow事件触发后再查询支付状态
    console.log('小程序环境：等待用户完成支付后返回...')

    // 保存回调函数，供handlePageShow使用
    if (this.state) {
      this.state.callbacks = callbacks
    }
  }

  /**
   * 处理页面显示事件（供页面调用）
   */
  handlePageShow(): void {
    if (this.state && this.state.isPolling) {
      console.log('页面重新显示，开始查询支付状态...')

      const env = Taro.getEnv()

      if (env === Taro.ENV_TYPE.WEAPP) {
        // 小程序环境：用户从支付小程序返回，直接查询一次支付状态
        this.checkPaymentStatusOnce()
      } else if (env === Taro.ENV_TYPE.WEB) {
        // H5环境：用户从支付页面返回，启动轮询查询支付状态
        this.startPolling(this.state.callbacks || {})
      }
    }
  }

  /**
   * 单次查询支付状态（小程序环境使用）
   */
  private async checkPaymentStatusOnce(): Promise<void> {
    if (!this.state) return

    try {
      const result = await RechargeService.getPaymentStatus({
        orderId: this.state.orderId
      })

      // 检查是否支付完成（所有字段都不为空）
      const isPaymentComplete = result.amount &&
                               result.description &&
                               result.createTime &&
                               result.payTime &&
                               result.attach

      if (isPaymentComplete) {
        // 校验attach是否匹配
        if (result.attach !== this.state.attach) {
          console.error('订单校验失败：attach不匹配', {
            expected: this.state.attach,
            received: result.attach
          })
          this.state.callbacks?.onFailed?.(result)
          this.cleanup()

          Taro.showToast({
            title: '订单校验失败',
            icon: 'error',
            duration: 2000
          })
          return
        }

        // 支付成功
        console.log('支付成功:', result)
        this.state.callbacks?.onSuccess?.(result)
        this.cleanup()

        // 不在这里显示提示，由回调函数处理
      } else {
        // 任何字段为空都表示等待支付，启动轮询
        console.log('支付状态未完成，启动短时间轮询...')
        this.startPolling(this.state.callbacks || {})
      }
    } catch (error) {
      console.error('查询支付状态失败:', error)

      // 查询失败，可能是网络问题，启动轮询重试
      this.startPolling(this.state.callbacks || {})
    }
  }

  /**
   * 开始轮询支付状态
   */
  private startPolling(callbacks: {
    onSuccess?: (result: PaymentStatusResponse) => void
    onFailed?: (result: PaymentStatusResponse) => void
    onTimeout?: () => void
  }): void {
    if (!this.state || !this.state.isPolling) return

    // 清理之前的轮询
    if (this.state.pollingCleanup) {
      this.state.pollingCleanup()
    }

    // 开始新的轮询
    const cleanup = RechargeService.startPaymentPolling(
      this.state.orderId,
      this.state.attach,
      {
        onSuccess: (result) => {
          console.log('支付成功:', result)
          this.cleanup()
          callbacks.onSuccess?.(result)

          // 不在这里显示提示，由回调函数处理
        },
        onFailed: (result) => {
          console.log('支付失败:', result)
          this.cleanup()
          callbacks.onFailed?.(result)

          // 显示失败提示
          Taro.showToast({
            title: result.message || '支付失败',
            icon: 'error',
            duration: 2000
          })
        },
        onTimeout: () => {
          console.log('支付查询超时')
          this.cleanup()
          callbacks.onTimeout?.()

          // 显示超时提示
          Taro.showModal({
            title: '支付状态查询超时',
            content: '无法确认支付状态，请稍后在个人中心查看余额变化',
            showCancel: false,
            confirmText: '知道了'
          })
        },
        maxAttempts: 30, // H5环境下减少轮询次数，避免长时间占用资源
        interval: 3000 // 增加轮询间隔
      }
    )

    this.state.pollingCleanup = cleanup
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.state) {
      // 停止轮询
      if (this.state.pollingCleanup) {
        this.state.pollingCleanup()
      }

      // 移除事件监听器
      if (this.state.visibilityChangeHandler) {
        this.state.visibilityChangeHandler()
      }

      this.state = null
    }
  }

  /**
   * 获取当前支付状态
   */
  getCurrentPaymentState(): PaymentState | null {
    return this.state
  }

  /**
   * 手动查询支付状态（供用户主动查询）
   */
  async manualCheckPaymentStatus(): Promise<PaymentStatusResponse | null> {
    if (!this.state) {
      return null
    }

    try {
      const result = await RechargeService.getPaymentStatus({
        orderId: this.state.orderId
      })

      // 检查是否支付完成（所有字段都不为空）
      const isPaymentComplete = result.amount &&
                               result.description &&
                               result.createTime &&
                               result.payTime &&
                               result.attach

      if (isPaymentComplete) {
        // 校验attach是否匹配
        if (result.attach !== this.state.attach) {
          console.error('订单校验失败：attach不匹配', {
            expected: this.state.attach,
            received: result.attach
          })
          this.cleanup()
          Taro.showToast({
            title: '订单校验失败',
            icon: 'error'
          })
          return null
        }

        // 支付成功
        this.cleanup()
        // 不在这里显示提示，由调用方处理
      } else {
        // 任何字段为空都表示等待支付
        Taro.showToast({
          title: '支付尚未完成',
          icon: 'none'
        })
      }

      return result
    } catch (error) {
      console.error('手动查询支付状态失败:', error)
      Taro.showToast({
        title: '查询失败，请稍后重试',
        icon: 'error'
      })
      return null
    }
  }
}