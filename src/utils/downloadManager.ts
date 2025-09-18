import Taro from '@tarojs/taro';

/**
 * 跨平台下载管理器
 * 统一处理H5和小程序环境下的下载功能
 */
export class DownloadManager {
  /**
   * 检测当前运行环境
   */
  static isH5(): boolean {
    return Taro.getEnv() === Taro.ENV_TYPE.WEB;
  }

  /**
   * 检测是否是iOS设备
   */
  static isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  /**
   * 检测是否支持下载功能
   */
  static supportsDownload(): boolean {
    if (this.isH5()) {
      if (typeof document === 'undefined') return false;
      const link = document.createElement('a');
      return typeof link.download !== 'undefined';
    }
    // 小程序环境总是支持下载到相册
    return true;
  }

  /**
   * 生成文件名
   */
  static generateFilename(url: string, prefix: string = 'image'): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const extension = pathname.split('.').pop() || 'gif';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `${prefix}_${timestamp}.${extension}`;
    } catch {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `${prefix}_${timestamp}.gif`;
    }
  }

  /**
   * H5环境下载图片
   */
  private static async downloadImageH5(url: string, filename?: string): Promise<void> {
    if (typeof document === 'undefined') {
      throw new Error('当前环境不支持H5下载');
    }

    try {
      // iOS设备特殊处理
      if (this.isIOS()) {
        await this.downloadImageIOS(url);
        return;
      }

      // 尝试使用fetch下载
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      // 创建下载链接
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || this.generateFilename(url);
      link.style.display = 'none';

      // 添加到DOM中触发下载
      document.body.appendChild(link);
      link.click();

      // 清理
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

    } catch (error) {
      console.error('H5下载失败:', error);
      // 降级到直接链接下载
      this.downloadImageByLinkH5(url, filename);
    }
  }

  /**
   * iOS设备下载图片处理
   */
  private static async downloadImageIOS(url: string): Promise<void> {
    try {
      // 获取图片数据
      const response = await fetch(url);
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      // 创建新窗口显示图片
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>长按保存图片</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body {
                  margin: 0;
                  padding: 20px;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  background: #f5f5f5;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .tip {
                  background: #007AFF;
                  color: white;
                  padding: 10px 20px;
                  border-radius: 8px;
                  margin-bottom: 20px;
                  text-align: center;
                  font-size: 16px;
                }
                img {
                  max-width: 100%;
                  height: auto;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
              </style>
            </head>
            <body>
              <div class="tip">长按图片保存到相册</div>
              <img src="${imageUrl}" alt="图片" />
            </body>
          </html>
        `);
        newWindow.document.close();
      } else {
        throw new Error('无法打开新窗口');
      }

      // 清理blob URL
      setTimeout(() => {
        URL.revokeObjectURL(imageUrl);
      }, 5000);

    } catch (error) {
      console.error('iOS下载失败:', error);
      throw error;
    }
  }

  /**
   * H5环境直接链接下载（降级方案）
   */
  private static downloadImageByLinkH5(url: string, filename?: string): void {
    if (typeof document === 'undefined') {
      throw new Error('当前环境不支持H5下载');
    }

    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || this.generateFilename(url);
      // 移除 target="_blank" 避免新标签页打开
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('H5链接下载失败:', error);
      throw error;
    }
  }

  /**
   * 小程序环境下载图片
   */
  private static async downloadImageMiniProgram(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      Taro.showLoading({ title: '下载中...' });

      // 首先检查相册授权
      Taro.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum'] === false) {
            // 用户之前拒绝了授权，需要引导用户手动开启
            Taro.hideLoading();
            Taro.showModal({
              title: '需要相册权限',
              content: '需要授权保存到相册才能下载图片，请在设置中开启相册权限',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  Taro.openSetting({
                    success: (settingRes) => {
                      if (settingRes.authSetting['scope.writePhotosAlbum']) {
                        this.performDownload(url, resolve, reject);
                      } else {
                        reject(new Error('用户未开启相册权限'));
                      }
                    },
                    fail: () => reject(new Error('打开设置失败'))
                  });
                } else {
                  reject(new Error('用户取消授权'));
                }
              }
            });
          } else if (res.authSetting['scope.writePhotosAlbum'] === undefined) {
            // 第一次请求授权
            Taro.authorize({
              scope: 'scope.writePhotosAlbum',
              success: () => {
                this.performDownload(url, resolve, reject);
              },
              fail: () => {
                Taro.hideLoading();
                reject(new Error('用户拒绝授权'));
              }
            });
          } else {
            // 已经授权
            this.performDownload(url, resolve, reject);
          }
        },
        fail: () => {
          Taro.hideLoading();
          reject(new Error('获取授权状态失败'));
        }
      });
    });
  }

  /**
   * 执行小程序下载
   */
  private static performDownload(
    url: string,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    // 检查隐私协议授权
    Taro.requirePrivacyAuthorize({
      success: () => {
        this.downloadFileInternal(url, resolve, reject);
      },
      fail: () => {
        Taro.hideLoading();
        reject(new Error('需要同意隐私协议才能保存图片'));
      }
    });
  }

  /**
   * 内部下载文件方法
   */
  private static downloadFileInternal(
    url: string,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    // 下载图片到本地
    Taro.downloadFile({
      url: url,
      success: (downloadRes) => {
        if (downloadRes.statusCode === 200) {
          // 保存到相册
          Taro.saveImageToPhotosAlbum({
            filePath: downloadRes.tempFilePath,
            success: () => {
              Taro.hideLoading();
              Taro.showToast({
                title: '保存成功',
                icon: 'success',
                duration: 2000
              });
              resolve();
            },
            fail: (saveError) => {
              Taro.hideLoading();
              console.error('保存到相册失败:', saveError);
              Taro.showToast({
                title: '保存失败',
                icon: 'none',
                duration: 2000
              });
              reject(new Error('保存到相册失败'));
            }
          });
        } else {
          Taro.hideLoading();
          Taro.showToast({
            title: '下载失败',
            icon: 'none',
            duration: 2000
          });
          reject(new Error(`下载失败: ${downloadRes.statusCode}`));
        }
      },
      fail: (downloadError) => {
        Taro.hideLoading();
        console.error('下载文件失败:', downloadError);
        Taro.showToast({
          title: '下载失败',
          icon: 'none',
          duration: 2000
        });
        reject(new Error('下载文件失败'));
      }
    });
  }

  /**
   * 统一下载接口
   * @param url 图片URL
   * @param filename 文件名（仅H5环境有效）
   * @returns Promise
   */
  static async downloadImage(url: string, filename?: string): Promise<void> {
    if (!url) {
      throw new Error('图片URL不能为空');
    }

    if (!this.supportsDownload()) {
      throw new Error('当前环境不支持下载');
    }

    if (this.isH5()) {
      // H5环境
      Taro.showLoading({ title: '下载中...' });
      try {
        await this.downloadImageH5(url, filename);
        Taro.hideLoading();
        Taro.showToast({
          title: '下载成功',
          icon: 'success',
          duration: 2000
        });
      } catch (error) {
        Taro.hideLoading();
        Taro.showToast({
          title: '下载失败',
          icon: 'none',
          duration: 2000
        });
        throw error;
      }
    } else {
      // 小程序环境
      await this.downloadImageMiniProgram(url);
    }
  }

  /**
   * 获取环境信息（用于调试）
   */
  static getEnvironmentInfo(): {
    isH5: boolean;
    supportsDownload: boolean;
    env: string;
  } {
    return {
      isH5: this.isH5(),
      supportsDownload: this.supportsDownload(),
      env: Taro.getEnv()
    };
  }
}