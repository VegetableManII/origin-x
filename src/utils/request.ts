import Taro from '@tarojs/taro';
import { SSEProcessor } from 'sse-kit/lib/bundle.weapp.esm';
import { CookieManager } from './cookieManager';

// SSE回调函数类型
export interface SSECallbacks {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

// SSE连接配置
export interface SSEConfig {
  timeout?: number;
  retryDelay?: number;
  maxRetryCount?: number;
  headers?: Record<string, string>;
}

// 后端统一的响应格式
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 请求配置接口
export interface RequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  header?: Record<string, string>;
  timeout?: number;
}

// 统一的网络请求工具
export class RequestService {
  private static BASE_URL = 'https://52725.uno/api/v1';

  /**
   * 获取基础URL
   */
  static getBaseURL(): string {
    return this.BASE_URL;
  }

  /**
   * 获取域名部分
   */
  static getDomain(): string {
    return this.BASE_URL.replace('/api/v1', '');
  }

  /**
   * 统一的网络请求方法
   * @param config 请求配置
   * @returns 处理后的响应数据
   */
  static async request<T = any>(config: RequestConfig): Promise<T> {
    try {
      // 构建完整URL
      const fullUrl = config.url.startsWith('http') ? config.url : `${this.BASE_URL}${config.url}`;

      // 添加认证头
      const headers = {
        'Content-Type': 'application/json',
        ...config.header
      };

      // 在小程序环境下手动添加Cookie
      if (CookieManager.isManualCookieRequired()) {
        const domain = CookieManager.extractDomainFromUrl(fullUrl);
        if (domain) {
          const cookieString = CookieManager.getCookieString(domain);
          if (cookieString) {
            headers['Cookie'] = cookieString;
          }
        }
      }

      const response = await Taro.request({
        credentials: 'include',
        url: fullUrl,
        method: config.method || 'GET',
        data: config.data,
        header: headers,
        timeout: config.timeout || 10000,
        // H5环境下启用withCredentials
        ...(Taro.getEnv() === Taro.ENV_TYPE.WEB && {
          enableHttp2: false,
          enableQuic: false,
          enableCache: false,
          dataType: 'json',
          responseType: 'text'
        })
      });

      // 在小程序环境下处理响应中的Set-Cookie
      if (CookieManager.isManualCookieRequired()) {
        CookieManager.handleSetCookieHeaders(response, fullUrl);
      }

      // 检查HTTP状态码
      if (response.statusCode !== 200) {
        throw new Error(`HTTP ${response.statusCode}: ${(response.data && response.data.message) || '请求失败'}`);
      }

      // 检查后端业务错误码
      const apiResponse = response.data as ApiResponse<T>;
      
      if (apiResponse.code !== 0) {
        // 处理特定的错误码
        switch (apiResponse.code) {
          case 40001:
          case 40002:
          case 40003:
            // 未授权，清除认证信息
            Taro.removeStorageSync('userId');

            // 在小程序环境下清除Cookie
            if (CookieManager.isManualCookieRequired()) {
              const domain = CookieManager.extractDomainFromUrl(fullUrl);
              if (domain) {
                CookieManager.clearDomainCookies(domain);
              }
            }

            // 直接跳转到登录页，不显示toast
            Taro.redirectTo({
              url: '/pages/login/index'
            }).catch(() => {
              // 如果重定向失败，尝试切换到tab页
              Taro.switchTab({
                url: '/pages/login/index'
              }).catch((error) => {
                console.error('跳转登录页失败:', error);
              });
            });
            break;
          default:
            Taro.showToast({
              title: apiResponse.message || '请求失败',
              icon: 'none',
              duration: 2000
            });
        }
        
        throw new Error(apiResponse.message || `业务错误: ${apiResponse.code}`);
      }

      // 返回数据部分
      return apiResponse.data;
    } catch (error) {
      // 如果是我们抛出的业务错误，直接抛出
      if (error instanceof Error) {
        throw error;
      }

      // 其他错误统一处理
      throw new Error('网络请求失败，请检查网络连接');
    }
  }

  /**
   * GET请求
   */
  static async get<T = any>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ url, method: 'GET', ...config });
  }

  /**
   * POST请求
   */
  static async post<T = any>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method' | 'data'>): Promise<T> {
    return this.request<T>({ url, method: 'POST', data, ...config });
  }

  /**
   * PUT请求
   */
  static async put<T = any>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method' | 'data'>): Promise<T> {
    return this.request<T>({ url, method: 'PUT', data, ...config });
  }

  /**
   * DELETE请求
   */
  static async delete<T = any>(url: string, config?: Omit<RequestConfig, 'url' | 'method'>): Promise<T> {
    return this.request<T>({ url, method: 'DELETE', ...config });
  }

  /**
   * PATCH请求
   */
  static async patch<T = any>(url: string, data?: any, config?: Omit<RequestConfig, 'url' | 'method' | 'data'>): Promise<T> {
    return this.request<T>({ url, method: 'PATCH', data, ...config });
  }

  /**
   * 创建SSE连接
   * @param url SSE接口地址
   * @param callbacks 回调函数
   * @param config SSE配置
   * @returns 清理函数
   */
  static createSSEConnection(
    url: string,
    callbacks: SSECallbacks,
    config: SSEConfig = {}
  ): () => void {
    const sseConfig = {
      timeout: 30000,
      retryDelay: 3000,
      maxRetryCount: 5,
      ...config
    };

    let shouldReconnect = true;
    let retryCount = 0;
    let eventSource: EventSource | undefined;
    let requestTask: Taro.RequestTask<any> | any | undefined;

    // 构建完整URL
    const fullUrl = this.buildFullURL(url);

    // 检测环境并选择连接方式
    if (this.supportsNativeSSE()) {
      connectWithNativeSSE();
    } else if (this.supportsWeChatChunked()) {
      connectWithWeChatChunked();
    } else {
      callbacks.onError?.(new Error('当前环境不支持SSE连接'));
    }

    // H5原生SSE连接
    function connectWithNativeSSE() {
      try {
        // 原生EventSource不支持自定义headers，但会自动携带同域cookie
        // 如果需要跨域cookie，需要确保服务器设置了正确的CORS
        eventSource = new EventSource(fullUrl, {
          withCredentials: true
        });

        eventSource.onopen = () => {
          retryCount = 0;
          callbacks.onOpen?.();
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // 发送统一格式的事件数据
            const sseEvent = {
              type: event.type || 'message',
              data: data,
              id: event.lastEventId,
              retry: undefined
            };
            callbacks.onMessage?.(sseEvent);
          } catch (error) {
            // 解析失败，忽略该消息
          }
        };

        // 监听自定义事件类型
        ['connected', 'status', 'finished', 'error'].forEach(eventType => {
          eventSource!.addEventListener(eventType, (event: any) => {
            try {
              const data = JSON.parse(event.data);
              const sseEvent = {
                type: eventType,
                data: data,
                id: event.lastEventId,
                retry: undefined
              };
              callbacks.onMessage?.(sseEvent);
            } catch (error) {
              // 解析失败，忽略该事件
            }
          });
        });

        eventSource.onerror = () => {
          if (shouldReconnect && retryCount < sseConfig.maxRetryCount!) {
            handleReconnect();
          } else {
            callbacks.onError?.(new Error('SSE连接失败'));
          }
        };
      } catch (error) {
        callbacks.onError?.(error as Error);
      }
    }

    // 微信小程序流式传输 - 使用 sse-kit
    function connectWithWeChatChunked() {
      try {

        // 准备请求头
        const headers: Record<string, string> = {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...sseConfig.headers
        };

        // 小程序环境下手动添加Cookie
        if (CookieManager.isManualCookieRequired()) {
          const domain = CookieManager.extractDomainFromUrl(fullUrl);
          if (domain) {
            const cookieString = CookieManager.getCookieString(domain);
            if (cookieString) {
              headers['Cookie'] = cookieString;
            }
          }
        }

        // 创建 SSEProcessor 实例
        const sse = new SSEProcessor({
          url: fullUrl as any, // 强制类型转换，因为我们已经构建了正确的URL
          method: 'GET',
          headers: headers as any, // 直接传递对象，避免使用 Headers 构造函数
          timeout: sseConfig.timeout || 30000,
          enableConsole: false, // 关闭sse-kit的控制台日志

          // 生命周期回调
          onHeadersReceived: () => {
            retryCount = 0;
            callbacks.onOpen?.();
          },

          onComplete: () => {
            callbacks.onClose?.();
          },

          onError: (err) => {
            if (shouldReconnect && retryCount < sseConfig.maxRetryCount!) {
              handleReconnect();
            } else {
              callbacks.onError?.(new Error(`SSE连接失败: ${err.message || err}`));
            }
          },

          // 数据预处理 - 直接返回原始数据
          preprocessDataCallback: (data) => {
            return data;
          }
        });

        // 开始消息迭代 - 使用 message() 方法
        (async () => {
          try {
            for await (const message of sse.message()) {
              // 在这里处理数据解析和格式化
              let processedData = message;

              try {
                // 处理 SSE 格式数据
                if (typeof message === 'string' && (message as string).trim()) {
                  let dataStr: string = message as string;

                  // 移除 "data:" 前缀
                  if (dataStr.startsWith('data:')) {
                    dataStr = dataStr.substring(5);
                  }

                  // 尝试解析 JSON
                  try {
                    processedData = JSON.parse(dataStr);
                  } catch (parseError) {
                    processedData = dataStr as any;
                  }
                }

                // 发送 SSE 事件
                const sseEvent = {
                  type: 'message',
                  data: processedData,
                  id: undefined,
                  retry: undefined
                };

                callbacks.onMessage?.(sseEvent);

              } catch (dataError) {
                // 发送原始数据
                callbacks.onMessage?.({
                  type: 'message',
                  data: message,
                  id: undefined,
                  retry: undefined
                });
              }
            }
          } catch (error) {
            if (shouldReconnect && retryCount < sseConfig.maxRetryCount!) {
              handleReconnect();
            } else {
              callbacks.onError?.(error as Error);
            }
          }
        })();

        // 保存引用用于清理
        requestTask = sse;

      } catch (error) {
        callbacks.onError?.(error as Error);
      }
    }



    // 处理重连
    function handleReconnect() {
      retryCount++;

      setTimeout(() => {
        if (shouldReconnect) {
          if (RequestService.supportsNativeSSE()) {
            connectWithNativeSSE();
          } else if (RequestService.supportsWeChatChunked()) {
            connectWithWeChatChunked();
          }
        }
      }, sseConfig.retryDelay);
    }

    // 返回清理函数
    return () => {
      shouldReconnect = false;

      if (eventSource) {
        eventSource.close();
        eventSource = undefined;
      }

      if (requestTask) {
        // 如果是 SSEProcessor 实例，调用 close 方法
        if (typeof requestTask.close === 'function') {
          requestTask.close();
        } else if (typeof requestTask.abort === 'function') {
          // 如果是传统的 Taro.RequestTask，调用 abort 方法
          requestTask.abort();
        }
        requestTask = undefined;
      }

      callbacks.onClose?.();
    };
  }

  /**
   * 构建完整URL
   */
  private static buildFullURL(url: string): string {
    if (url.startsWith('http')) {
      return url;
    } else if (url.startsWith('/api/v1/')) {
      return `${this.getDomain()}${url}`;
    } else {
      return `${this.BASE_URL}${url}`;
    }
  }

  /**
   * 检测是否支持原生SSE
   */
  private static supportsNativeSSE(): boolean {
    const env = Taro.getEnv();
    return env === Taro.ENV_TYPE.WEB && typeof EventSource !== 'undefined';
  }

  /**
   * 检测是否支持微信小程序enableChunked
   */
  private static supportsWeChatChunked(): boolean {
    return Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
  }
}
