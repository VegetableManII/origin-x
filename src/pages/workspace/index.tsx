import { View, Text, Image, Video, Textarea } from '@tarojs/components'
import Taro, { useLoad, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react'
// UploadService 改为按需加载
// H5UploadUtils 改为按需加载
import { DemoExample, GenerateConfig } from '../../services/generate'
// GenerateService 改为按需加载
import { useUser } from '../../stores/userStore'
// DownloadManager 改为按需加载
import { WorkPreviewData } from '../../components/WorkPreviewModal'

import './index.less'

// 懒加载组件
const WorkPreviewModal = lazy(() => import('../../components/WorkPreviewModal'))

// 定义消息类型
interface Message {
  id: string
  type: 'text' | 'image' | 'demo-card' | 'loading'
  content: string
  timestamp: number
  isUser: boolean
  demoData?: {
    videoUrl: string
    prompt: string
  }
}

// 定义上传的图片类型
interface UploadedImage {
  id: string
  url: string
  name: string
  size: number
  width?: number // 图片宽度
  height?: number // 图片高度
  uploadTime: number // 上传时间
}

// 自适应图片气泡组件
interface AdaptiveImageBubbleProps {
  src: string
  alt: string
  onClick: () => void
  isH5: boolean
}

function AdaptiveImageBubble({ src, alt, onClick, isH5 }: AdaptiveImageBubbleProps) {
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  // 计算自适应尺寸
  const calculateAdaptiveSize = (naturalWidth: number, naturalHeight: number) => {
    const maxWidth = 150  // 最大宽度
    const maxHeight = 200 // 最大高度
    const minWidth = 100  // 最小宽度
    const minHeight = 75  // 最小高度

    let width = naturalWidth
    let height = naturalHeight

    // 如果图片太大，按比例缩小
    if (width > maxWidth || height > maxHeight) {
      const ratioW = maxWidth / width
      const ratioH = maxHeight / height
      const ratio = Math.min(ratioW, ratioH)
      width = width * ratio
      height = height * ratio
    }

    // 如果图片太小，适当放大
    if (width < minWidth && height < minHeight) {
      const ratioW = minWidth / width
      const ratioH = minHeight / height
      const ratio = Math.min(ratioW, ratioH)
      width = width * ratio
      height = height * ratio
    }

    return { width: Math.round(width), height: Math.round(height) }
  }

  const handleImageLoad = (e: any) => {
    const img = e.target || e.detail
    const naturalWidth = img.naturalWidth || img.width
    const naturalHeight = img.naturalHeight || img.height

    if (naturalWidth && naturalHeight) {
      const adaptiveSize = calculateAdaptiveSize(naturalWidth, naturalHeight)
      setImageDimensions(adaptiveSize)
    }
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageError(true)
  }

  const containerStyle = imageDimensions ? {
    width: `${imageDimensions.width}px`,
    height: `${imageDimensions.height}px`
  } : {
    width: '150px',
    height: '100px'
  }

  const imageStyle = imageDimensions ? {
    width: `${imageDimensions.width}px`,
    height: `${imageDimensions.height}px`
  } : {
    width: '150px',
    height: '100px'
  }

  return (
    <View className='adaptive-image-container' style={containerStyle}>
      {!imageError ? (
        isH5 ? (
          <img
            className='adaptive-bubble-image'
            src={src}
            alt={alt}
            style={{
              ...imageStyle,
              cursor: 'pointer',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease'
            }}
            onClick={onClick}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        ) : (
          <Image
            className='adaptive-bubble-image'
            src={src}
            style={imageStyle}
            onClick={onClick}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )
      ) : (
        <View
          className='adaptive-image-fallback'
          style={containerStyle}
          onClick={onClick}
        >
          <Text className='fallback-icon'>🖼️</Text>
          <Text className='fallback-text'>图片加载失败</Text>
        </View>
      )}

      {/* 加载状态 */}
      {!imageLoaded && !imageError && (
        <View className='adaptive-image-loading' style={containerStyle}>
          <Text className='loading-text'>加载中...</Text>
        </View>
      )}
    </View>
  )
}

export default function Workspace() {
  const { state: userState } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState<string>('')
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [_isUploading, setIsUploading] = useState<boolean>(false)
  const [_uploadProgress, setUploadProgress] = useState<number>(0)
  const [cleanupFunction, setCleanupFunction] = useState<(() => void) | null>(null)
  const [isProcessing, setIsProcessing] = useState<boolean>(false) // 是否正在处理任务
  const [isSending, setIsSending] = useState<boolean>(false) // 是否正在发送消息
  const [_isDragOver, setIsDragOver] = useState<boolean>(false)
  const [demoExample, setDemoExample] = useState<DemoExample | null>(null)
  const [_isLoadingDemo, setIsLoadingDemo] = useState<boolean>(false)
  const [generateConfig, setGenerateConfig] = useState<GenerateConfig | null>(null)
  const [_tabBarHeight, setTabBarHeight] = useState<number>(50) // tabBar高度
  const [_inputOptions, setInputOptions] = useState<string[]>([]) // 输入选项
  const [selectedStyle, setSelectedStyle] = useState<string>('style-b') // 选中的风格，优先使用"动作的幅度更大"
  const [showStyleDropdown, setShowStyleDropdown] = useState<boolean>(false) // 是否显示风格下拦框
  // 作品预览弹窗状态
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [selectedWork, setSelectedWork] = useState<WorkPreviewData | null>(null)
  const [generatedWorksData, setGeneratedWorksData] = useState<Map<string, WorkPreviewData>>(new Map()) // 存储生成的作品数据

  const uploadAreaRef = useRef<any>(null)
  const messagesEndRef = useRef<any>(null)
  const textareaRef = useRef<any>(null) // Textarea组件引用

  // 页面级分享配置
  useShareAppMessage(() => {
    return {
      title: '表情包动起来 - AI驱动动图生成',
      path: '/pages/workspace/index',
      imageUrl: '' // 可以设置分享图片
    }
  })

  useShareTimeline(() => {
    return {
      title: '表情包动起来 - AI驱动动图生成',
      imageUrl: '' // 可以设置分享图片
    }
  })

  useLoad(() => {
    loadDemoExample()
    loadGenerateConfig()
    loadInputOptions()
    getTabBarHeight()

    // H5环境下监听视口变化
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      setupH5KeyboardListener()
    }


    // 添加机器人欢迎消息
    const welcomeMessage: Message = {
      id: 'welcome-' + Date.now().toString(),
      type: 'text',
      content: '你好！😄 只需要上传一张图片🏞，然后描述你想要的动画效果✨，我就能为你生成精彩的动图！\n💡 支持人物动作、物体移动、特效添加等多种动画类型',
      timestamp: Date.now(),
      isUser: false
    }
    setMessages([welcomeMessage])
  })

  // 获取tabBar高度
  const getTabBarHeight = (): void => {
    try {
      if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
        // 微信小程序环境 - 使用新的API
        try {
          const windowInfo = Taro.getWindowInfo()
          const systemInfo = Taro.getDeviceInfo()

          let calculatedHeight = 50 // 默认高度
          const safeAreaInsetBottom = windowInfo.safeArea ? windowInfo.screenHeight - windowInfo.safeArea.bottom : 0
          // 小程序tabBar高度：iOS一般49px + 安全区域，Android一般50px + 安全区域
          calculatedHeight = systemInfo.platform === 'ios' ? 49 + safeAreaInsetBottom : 50 + safeAreaInsetBottom
          setTabBarHeight(calculatedHeight)
          updateMainContentPadding(calculatedHeight)

          console.log('小程序tabBar高度计算:', {
            platform: systemInfo.platform,
            safeAreaInsetBottom,
            calculatedHeight
          })
        } catch (error) {
          // 如果新API不支持，降级使用旧API
          Taro.getSystemInfo({
            success: (res) => {
              let calculatedHeight = 50
              const safeAreaInsetBottom = res.safeArea ? res.screenHeight - res.safeArea.bottom : 0
              // 降级API也使用相同的计算逻辑
              calculatedHeight = res.platform === 'ios' ? 49 + safeAreaInsetBottom : 50 + safeAreaInsetBottom
              setTabBarHeight(calculatedHeight)
              updateMainContentPadding(calculatedHeight)
            },
            fail: () => {
              setTabBarHeight(50)
              updateMainContentPadding(50)
            }
          })
        }
      } else if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
            // H5环境，可以通过DOM查询
            setTimeout(() => {
              // 尝试多种选择器来查找tabBar
              const tabBarSelectors = [
                '.taro-tabbar__tabbar',
                '.taro-tabbar',
                '[role="tablist"]',
                '.tabbar'
              ]
              
              let tabBar: Element | null = null
              for (const selector of tabBarSelectors) {
                tabBar = document.querySelector(selector)
                if (tabBar) break
              }

              if (tabBar) {
                const rect = tabBar.getBoundingClientRect()
                const calculatedHeight = rect.height
                setTabBarHeight(calculatedHeight)

                // 同时更新主内容区域的padding
                updateMainContentPadding(calculatedHeight)
              } else {
                setTabBarHeight(50)
                updateMainContentPadding(50)
              }
            }, 300) // 增加延迟确保DOM完全渲染
          } else {
            // 其他环境使用默认高度
            setTabBarHeight(50)
            updateMainContentPadding(50)
          }
    } catch (error) {
      setTabBarHeight(50)
      updateMainContentPadding(50)
    }
  }

  // 更新主内容区域的padding
  const updateMainContentPadding = (height: number): void => {
    const inputAreaHeight = 140 // 估算的输入区域高度
    const totalBottomSpace = inputAreaHeight + height

    // 动态设置CSS变量或直接修改样式
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--tabbar-height', `${height}px`)
      document.documentElement.style.setProperty('--input-area-bottom-space', `${totalBottomSpace}px`)
    }
  }


  // 设置H5键盘监听器 - 禁用自动移动，保持和tabbar的相对位置
  const setupH5KeyboardListener = (): void => {
  }

  // 设置H5环境下的滚动行为
  const setupH5ScrollBehavior = (): (() => void) | undefined => {
    if (typeof document !== 'undefined') {
      // 防止整个页面的滚动和下拉刷新
      const preventDefaultScroll = (e: TouchEvent) => {
        // 检查是否是在可滚动区域内
        const target = e.target as HTMLElement
        const mainContent = document.querySelector('.main-content')
        const inputArea = document.querySelector('.input-area')

        // 允许在以下区域内的滚动：
        // 1. main-content 区域内
        // 2. input-area 区域内（输入框滚动）
        const isInScrollableArea = (
          (mainContent && mainContent.contains(target)) ||
          (inputArea && inputArea.contains(target))
        )

        if (!isInScrollableArea) {
          // 只阻止非滚动区域的触摸移动
          e.preventDefault()
        }
      }

      // 防止页面被拖拽
      const preventDrag = (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault()
        }
      }

      // 防止双击缩放
      const preventZoom = (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault()
        }
      }

      // 监听全局触摸事件
      document.addEventListener('touchstart', preventZoom, { passive: false })
      document.addEventListener('touchmove', preventDefaultScroll, { passive: false })
      document.addEventListener('gesturestart', preventDrag, { passive: false })

      // 特别处理body的滚动
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'

      // 组件卸载时清理
      return () => {
        document.removeEventListener('touchstart', preventZoom)
        document.removeEventListener('touchmove', preventDefaultScroll)
        document.removeEventListener('gesturestart', preventDrag)

        document.body.style.overflow = ''
        document.body.style.position = ''
        document.body.style.width = ''
        document.body.style.height = ''
      }
    }
  }

  // 加载输入选项
  const loadInputOptions = async (): Promise<void> => {
    try {
      // 这里应该调用实际的API接口
      // const options = await SomeService.getInputOptions()
      
      // 暂时使用模拟数据
      const mockOptions = [
        '让头发飘动',
        '眼睛眨动', 
        '微笑',
        '点头',
        '招手',
        '背景特效'
      ]
      setInputOptions(mockOptions)
    } catch (error) {
      // 使用默认选项
      setInputOptions(['让头发飘动', '眼睛眨动', '微笑'])
    }
  }


  // 处理风格选择
  const handleStyleSelect = (styleValue: string): void => {
    setSelectedStyle(styleValue)
    setShowStyleDropdown(false)
  }

  // 获取当前选中风格的显示名称
  const getSelectedStyleLabel = (): string => {
    if (!generateConfig || !generateConfig.styles) return '默认风格'
    
    const entries = Object.entries(generateConfig.styles)
    const found = entries.find(([_, value]) => value === selectedStyle)
    return found ? found[0] : '默认风格'
  }

  // 加载生成配置
  const loadGenerateConfig = async (): Promise<void> => {
    try {
      const { GenerateService } = await import('../../services/generate')
      const config = await GenerateService.getGenerateConfig()

      // 对风格选项进行排序，"动作的幅度更大"排在最前面
      if (config.styles) {
        const sortedStyles: Record<string, string> = {}
        const entries = Object.entries(config.styles)

        // 优先添加"动作的幅度更大"
        const preferredEntry = entries.find(([label]) => label === '动作的幅度更大')
        if (preferredEntry) {
          sortedStyles[preferredEntry[0]] = preferredEntry[1]
        }

        // 添加其他选项
        entries.forEach(([label, value]) => {
          if (label !== '动作的幅度更大') {
            sortedStyles[label] = value
          }
        })

        config.styles = sortedStyles
      }

      setGenerateConfig(config)

      // 优先选择"动作的幅度更大"作为默认选项
      if (config.styles && Object.keys(config.styles).length > 0) {
        const preferredStyleValue = config.styles['动作的幅度更大']
        const defaultStyleValue = preferredStyleValue || Object.values(config.styles)[0]

        if (selectedStyle === 'default' || selectedStyle === 'style-b' || !Object.values(config.styles).includes(selectedStyle)) {
          setSelectedStyle(defaultStyleValue)
        }
      }
    } catch (error) {
      // 使用默认配置作为后备
      const fallbackConfig = {
        styles: {
          '动作的幅度更大': 'style-b',
          '主体保持的更好': 'style-a'
        }
      }
      setGenerateConfig(fallbackConfig)

      // 设置默认选中"动作的幅度更大"
      setSelectedStyle('style-b')
    }
  }

  // 加载demo示例数据
  const loadDemoExample = async (): Promise<void> => {
    try {
      setIsLoadingDemo(true)
      const { GenerateService } = await import('../../services/generate')
      const demo = await GenerateService.getDemoExample()
      setDemoExample(demo)
      
      // 添加demo卡片消息到聊天
      const demoCardMessage: Message = {
        id: 'demo-card-' + Date.now().toString(),
        type: 'demo-card',
        content: '这是一个示例效果，点击下方动图可以快速体验',
        timestamp: Date.now(),
        isUser: false,
        demoData: {
          videoUrl: demo.prevVideoUrl,
          prompt: demo.prompt
        }
      }
      
      // 添加demo消息（在欢迎消息之后）
      setMessages(prev => [...prev, demoCardMessage])
      
    } catch (error) {
      // 使用默认的示例数据作为后备
      setDemoExample({
        imageUrl: 'https://via.placeholder.com/400x400/FFB6C1/FFFFFF?text=Demo+Image',
        prevVideoUrl: 'https://via.placeholder.com/300x200/FFB6C1/DDDDDD?text=Demo+GIF',
        prompt: '让头发飘动，眼睛眨动，背景添加飘落的樱花特效',
        style: 'default'
      })
      
      // 即使是默认数据也添加到消息中
      const demoCardMessage: Message = {
        id: 'demo-card-fallback-' + Date.now().toString(),
        type: 'demo-card',
        content: '这是一个示例效果，点击下方动图可以快速体验',
        timestamp: Date.now(),
        isUser: false,
        demoData: {
          videoUrl: 'https://via.placeholder.com/300x200/FFB6C1/DDDDDD?text=Demo+GIF',
          prompt: '让头发飘动，眼睛眨动，背景添加飘落的樱花特效'
        }
      }
      
      setMessages(prev => [...prev, demoCardMessage])
      
    } finally {
      setIsLoadingDemo(false)
    }
  }

  // 检测当前环境
  const isH5 = Taro.getEnv() === Taro.ENV_TYPE.WEB



  // H5环境下设置滚动行为
  useEffect(() => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
      return setupH5ScrollBehavior()
    }
  }, [])

  // 组件卸载时清理SSE连接
  useEffect(() => {
    return () => {
      if (cleanupFunction) {
        cleanupFunction()
      }
    }
  }, [cleanupFunction])

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        if (isH5) {
          // H5环境使用原生scrollIntoView，确保消息不被输入框遮挡
          if (messagesEndRef.current) {
            // H5环境使用原生scrollIntoView，确保消息不被输入框遮挡

            // 滚动到消息底部，但留出输入框高度的空间
            const mainContent = document.querySelector('.main-content') as HTMLElement
            if (mainContent) {
              const scrollHeight = mainContent.scrollHeight
              const clientHeight = mainContent.clientHeight
              const maxScroll = scrollHeight - clientHeight
              const targetScroll = Math.max(0, maxScroll)

              mainContent.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
              })
            } else {
              // 降级方案：使用原来的方法但调整block位置
              messagesEndRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest' // 改为nearest避免被输入框完全遮挡
              })
            }
          }
        } else {
          // 小程序环境使用Taro的pageScrollTo，考虑输入框高度
          const query = Taro.createSelectorQuery()
          query.select('.messages-end').boundingClientRect()
          query.select('.input-area').boundingClientRect()
          query.selectViewport().scrollOffset()
          query.exec((res) => {
            if (res[0] && res[2]) {
              const messagesEndRect = res[0]
              const inputAreaRect = res[1]
              const scrollOffset = res[2]

              // 计算目标滚动位置，确保消息不被输入框遮挡
              const inputHeight = inputAreaRect ? inputAreaRect.height : 150
              const targetTop = messagesEndRect.top + scrollOffset.scrollTop - inputHeight - 20 // 额外留20px空间

              Taro.pageScrollTo({
                scrollTop: Math.max(0, targetTop),
                duration: 300
              })
            } else {
              // 降级方案：滚动到很大的值但稍微减少一些
              Taro.pageScrollTo({
                scrollTop: 99999 - 200, // 减少200px避免被输入框遮挡
                duration: 300
              })
            }
          })
        }
      }, 100)
    }
  }, [messages, isH5])

  // 获取图片尺寸
  const getImageDimensions = (file: File): Promise<{width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
        URL.revokeObjectURL(img.src) // 清理内存
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  // 处理文件上传
  const handleFileUpload = useCallback(async (file:File): Promise<void> => {
    try {
      setIsUploading(true)
      setUploadProgress(0)
      
      // 动态加载验证工具
      const { H5UploadUtils } = await import('../../utils/h5Upload')

      // 验证文件类型
      if (!H5UploadUtils.isValidImage(file)) {
        throw new Error('不支持的文件类型，请选择有效的图片文件')
      }

      // 检查文件大小
      const maxSize = 10 * 1024 * 1024 // 10MB
      if (!H5UploadUtils.checkFileSize(file, maxSize)) {
        throw new Error(`文件大小不能超过${H5UploadUtils.formatFileSize(maxSize)}`)
      }
      
      // 获取图片尺寸
      const dimensions = await getImageDimensions(file)
      
      // 验证图片尺寸范围
      if (dimensions.width < 300 || dimensions.height < 300 || dimensions.width > 5000 || dimensions.height > 5000) {
        throw new Error('图片尺寸不符合要求，请上传300×300至5000×5000范围内的图片')
      }
      
      // 显示上传进度提示
      Taro.showLoading({
        title: '正在上传图片...'
      })
      
      try {
        // 上传进度回调
        const onProgress = (progress: number) => {
          setUploadProgress(progress)
        }        
        // 动态加载上传服务并上传图片到图床
        const { UploadService } = await import('../../services/upload')
        const { imageUrl } = await UploadService.uploadImage(
          file,
          file.name,
          onProgress
        )
        // 创建图片对象
        const newImage: UploadedImage = {
          id: Date.now().toString(),
          url: imageUrl,
          name: file.name,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
          uploadTime: Date.now()
        }
        
        // 设置上传的图片
        setUploadedImage(newImage)
        
        // 隐藏加载提示
        Taro.hideLoading()
        
        // 显示成功提示
        Taro.showToast({
          title: '上传成功',
          icon: 'success'
        })
      } catch (uploadError) {
        const errorMessage = uploadError instanceof Error ? uploadError.message : '图片上传失败'
        Taro.hideLoading()
        Taro.showToast({
          title: errorMessage,
          icon: 'error'
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件上传失败'
      Taro.hideLoading()
      Taro.showToast({
        title: errorMessage,
        icon: 'error'
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [])

  // 处理拖拽上传
  const handleDragAndDrop = useCallback(async (files: File[]): Promise<void> => {
    setIsDragOver(false) // 重置拖拽状态

    if (files.length === 0) return

    // 只处理第一个文件
    const file = files[0]
    await handleFileUpload(file)
  }, [handleFileUpload])

  // 启用拖拽上传（仅H5环境）
  useEffect(() => {
    if (isH5 && uploadAreaRef.current) {
      let cleanup: (() => void) | undefined

      // 动态加载 H5UploadUtils
      import('../../utils/h5Upload').then(({ H5UploadUtils }) => {
        if (uploadAreaRef.current) {
          cleanup = H5UploadUtils.enableDragAndDrop(
            uploadAreaRef.current,
            handleDragAndDrop
          )
        }
      })

      return () => {
        if (cleanup) cleanup()
      }
    }
  }, [isH5, handleDragAndDrop])

  // 处理图片上传
  const handleChooseImage = async (): Promise<void> => {
    try {
      if (isH5) {
        // H5环境：使用自定义文件选择器
        try {
          const { H5UploadUtils } = await import('../../utils/h5Upload')
          const files = await H5UploadUtils.chooseFiles('image/*', false)
          if (files.length === 0) {
            throw new Error('未选择文件')
          }

          await handleFileUpload(files[0])
          
        } catch (error) {
          // 如果是用户取消选择文件，不显示错误提示
          if (error instanceof Error && (
            error.message === '未选择文件' ||
            error.message.includes('用户取消') ||
            error.message.includes('canceled') ||
            error.message.includes('cancelled')
          )) {
            return // 静默处理，不显示toast
          }

          const errorMessage = error instanceof Error ? error.message : '文件选择失败'
          Taro.showToast({
            title: errorMessage,
            icon: 'error'
          })
        }
      } else {
        // 小程序环境：使用Taro的图片选择API
        const { tempFilePaths, tempFiles } = await Taro.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera']
        })

        if (!tempFilePaths || tempFilePaths.length === 0) {
          throw new Error('未选择图片')
        }

        const file = tempFiles && tempFiles[0]
        const localPath = tempFilePaths[0]
        const fileName = (file && file.originalFileObj && file.originalFileObj.name) || `image_${Date.now()}.jpg`
        const fileSize = (file && file.size) || 0
        
        // 小程序环境获取图片信息
        const imageInfo = await new Promise<{width: number, height: number}>((resolve, reject) => {
          Taro.getImageInfo({
            src: localPath,
            success: (res) => resolve({ width: res.width, height: res.height }),
            fail: reject
          })
        })
        
        // 验证图片尺寸范围
        if (imageInfo.width < 300 || imageInfo.height < 300 || imageInfo.width > 5000 || imageInfo.height > 5000) {
          throw new Error('图片尺寸不符合要求，请上传300×300至5000×5000范围内的图片')
        }
        
        // 显示上传进度提示
        Taro.showLoading({
          title: '正在上传图片...'
        })
        
        try {
          // 上传进度回调
          const onProgress = (progress: number) => {
            setUploadProgress(progress)
          }
          
          // 动态加载上传服务并上传图片到图床
          const { UploadService } = await import('../../services/upload')
          const { imageUrl } = await UploadService.uploadImage(
            localPath,
            fileName,
            onProgress
          )
          
          // 创建图片对象
          const newImage: UploadedImage = {
            id: Date.now().toString(),
            url: imageUrl,
            name: fileName,
            size: fileSize,
            width: imageInfo.width,
            height: imageInfo.height,
            uploadTime: Date.now()
          }
          
          // 设置上传的图片
          setUploadedImage(newImage)
          // 隐藏加载提示
          Taro.hideLoading()
          
          // 显示成功提示
          Taro.showToast({
            title: '上传成功',
            icon: 'success'
          })
        } catch (uploadError) {
          const errorMessage = uploadError instanceof Error ? uploadError.message : '图片上传失败'
          Taro.hideLoading()
          Taro.showToast({
            title: errorMessage,
            icon: 'error'
          })
        }
      }
    } catch (error) {
      // 如果是用户取消选择图片，不显示错误提示
      if (error instanceof Error && (
        error.message.includes('用户取消') ||
        error.message.includes('canceled') ||
        error.message.includes('cancelled') ||
        error.message.includes('fail cancel') ||
        error.message === '未选择图片'
      )) {
        return // 静默处理，不显示toast
      }

      const errorMessage = error instanceof Error ? error.message : '选择图片失败'
      Taro.showToast({
        title: errorMessage,
        icon: 'error'
      })
    }
  }


  // 处理文本输入
  const handleInputChange = (e: any): void => {
    // 移除开头的空行但保留用户输入的换行
    const value = e.detail.value || ''
    setInputText(value)
  }

  // 处理输入框获得焦点
  const handleInputFocus = (): void => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      // 小程序环境下，延迟滚动确保键盘完全弹出
      setTimeout(() => {
        // 滚动到输入区域
        const query = Taro.createSelectorQuery()
        query.select('.input-area').boundingClientRect()
        query.selectViewport().scrollOffset()
        query.exec((res) => {
          if (res[0] && res[1]) {
            const inputTop = res[0].top + res[1].scrollTop
            const viewportHeight = res[1].windowHeight || 0
            const keyboardHeight = 300 // 估算键盘高度
            const targetScrollTop = inputTop - (viewportHeight - keyboardHeight) + 100

            if (targetScrollTop > 0) {
              Taro.pageScrollTo({
                scrollTop: targetScrollTop,
                duration: 300
              })
            }
          }
        })
      }, 300) // 等待键盘动画完成
    }
    // H5环境下不需要在focus时处理，交给visualViewport监听
  }

  // 处理输入框失去焦点
  const handleInputBlur = (): void => {
    // H5环境下交给visualViewport监听处理
    // 其他环境保持当前位置，用户体验更好
  }

  // 点击页面其他区域收起键盘
  const handlePageClick = (e: any): void => {
    // 只在小程序环境下执行
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
      return
    }

    // 检查点击的元素是否是输入相关的区域
    const target = e.target || e.currentTarget

    // 多重检查确保不是输入区域
    const isInputRelated = (
      // 检查类名
      target?.classList?.contains('input-area') ||
      target?.classList?.contains('input-container') ||
      target?.classList?.contains('input-card') ||
      target?.classList?.contains('text-input-wrapper') ||
      target?.classList?.contains('main-text-input') ||
      target?.classList?.contains('image-upload-btn') ||
      target?.classList?.contains('style-dropdown') ||
      target?.classList?.contains('send-btn') ||
      // 检查父元素（使用原生DOM方法更可靠）
      (target?.closest && (
        target.closest('.input-area') ||
        target.closest('.input-container') ||
        target.closest('.input-card') ||
        target.closest('.text-input-wrapper') ||
        target.closest('.main-text-input')
      ))
    )

    // 如果点击的不是输入相关区域，收起键盘
    if (!isInputRelated) {
      // 调用输入框的blur方法收起键盘
      if (textareaRef.current) {
        textareaRef.current.blur()
      }
    }
  }





  // 处理发送消息
  const handleSendMessage = async (): Promise<void> => {
    if (!inputText.trim()) {
      Taro.showToast({
        title: '请输入动画描述文字',
        icon: 'none'
      })
      return
    }

    if (!uploadedImage) {
      Taro.showToast({
        title: '请上传图片',
        icon: 'none'
      })
      return
    }

    // 检查是否正在处理任务或发送中
    if (isProcessing || isSending) {
      Taro.showToast({
        title: '正在处理中，请稍候...',
        icon: 'none'
      })
      return
    }

    // 设置发送状态，显示加载动画
    setIsSending(true)

    // 先保存用户消息数据，暂不添加到消息列表
    const userTextMessage: Message = {
      id: Date.now().toString(),
      type: 'text',
      content: inputText.trim(),
      timestamp: Date.now(),
      isUser: true
    }

    const userImageMessage: Message | null = uploadedImage ? {
      id: (Date.now() - 1).toString(),
      type: 'image',
      content: uploadedImage.url,
      timestamp: Date.now() - 1,
      isUser: true
    } : null

    try {
      // 动态加载生成服务并调用API创建任务
      const { GenerateService } = await import('../../services/generate')
      const requestData: any = {
        prompt: inputText.trim(),
        style: selectedStyle
      }

      // 如果有上传的图片，添加imageUrl
      if (uploadedImage && uploadedImage.url) {
        requestData.imageUrl = uploadedImage.url
      }

      const taskResponse = await GenerateService.createTask(requestData)

      // API调用成功，恢复发送按钮状态，设置处理状态
      setIsSending(false)
      setIsProcessing(true)

      // 现在添加用户消息到界面
      const messagesToAdd: Message[] = []
      if (userImageMessage) {
        messagesToAdd.push(userImageMessage)
      }
      messagesToAdd.push(userTextMessage)
      setMessages(prev => [...prev, ...messagesToAdd])

      // 显示AI正在处理的消息
      const processingMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: 'loading',
        content: '',
        timestamp: Date.now(),
        isUser: false
      }
      setMessages(prev => [...prev, processingMessage])

      // 开始监听任务状态更新 - SSE适配器自动检测环境
      const cleanup = GenerateService.listenToTaskStatus(
        taskResponse.taskId,
        {
          onConnected: () => {
            // 不显示连接状态消息，直接保持原有的处理状态
          },
          onStatusUpdate: (data) => {
            handleStatusUpdate(data, processingMessage.id)
          },
          onFinished: (data) => {
            handleTaskFinished(data, processingMessage.id)
          },
          onError: (data) => {
            handleTaskError(data, processingMessage.id)
          },
          onConnectionError: (error) => {
            handleConnectionError(error, processingMessage.id)
          }
        },
        taskResponse.sseUrl // 传递服务端返回的SSE URL
      )

      // 存储清理函数，以便在组件卸载时调用
      setCleanupFunction(() => cleanup)

      // 清空输入数据
      setInputText('')
      setUploadedImage(null)
      
    } catch (error) {

      // 重置所有状态
      setIsSending(false)
      setIsProcessing(false)

      // API调用失败，不添加用户消息，直接显示错误提示
      const errorMessage = error instanceof Error ? error.message : '发送失败，请重试'
      Taro.showToast({
        title: errorMessage,
        icon: 'error'
      })
    }
  }

  // 移除上传的图片
  const handleRemoveImage = (e: any): void => {
    e.stopPropagation() // 阻止事件冒泡，避免触发上传
    setUploadedImage(null)
  }

  // 处理图片预览 - 显示预览弹窗
  const handleImagePreview = (url: string, messageId: string): void => {
    // 查找对应的作品数据
    const workData = generatedWorksData.get(messageId)

    if (workData) {
      // 如果有完整的作品数据，使用预览弹窗
      setSelectedWork(workData)
      setPreviewModalVisible(true)
    } else {
      // 如果没有作品数据，使用原生图片预览
      Taro.previewImage({
        urls: [url],
        current: url
      })
    }
  }

  // 关闭预览弹窗
  const handleClosePreviewModal = (): void => {
    setPreviewModalVisible(false)
    setSelectedWork(null)
  }

  // 处理下载（从弹窗中触发）
  const handleDownloadFromModal = async (workData: WorkPreviewData): Promise<void> => {
    try {
      const { DownloadManager } = await import('../../utils/downloadManager')
      await DownloadManager.downloadImage(workData.gifUrl)
    } catch (error) {
      // 下载失败时显示错误提示
      Taro.showToast({
        title: '下载失败',
        icon: 'error'
      })
    }
  }

  // 处理demo卡片点击
  const handleDemoCardClick = (messageId: string): void => {
    // 如果是demo卡片消息，自动填充参数到输入组件
    if (messageId.includes('demo-card')) {
      const message = messages.find(msg => msg.id === messageId)
      if (message && message.demoData) {
        // 创建示例图片对象
        const exampleImage: UploadedImage = {
          id: 'demo-' + Date.now().toString(),
          url: (demoExample && demoExample.imageUrl) || '',
          name: '示例图片.jpg',
          size: 2048000, // 模拟大小 2MB
          width: 1024,
          height: 1024,
          uploadTime: Date.now()
        }
        
        // 直接设置图片和文本到输入组件
        setUploadedImage(exampleImage)
        setInputText(message.demoData.prompt)
        
        // 滚动到输入区域（可选）
        setTimeout(() => {
          const inputArea = document.querySelector('.input-area')
          if (inputArea) {
            inputArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        }, 100)
      }
    }
  }

  // 处理状态更新事件
  const handleStatusUpdate = (data: any, messageId: string) => {
    const { status, progress } = data

    let statusText = '正在处理...'
    if (status === 'processing') {
      statusText = `正在生成中... ${progress}%`
    } else if (status === 'pending') {
      statusText = '任务已创建，等待处理...'
    } else if (status === 'completed') {
      statusText = '任务已完成，正在生成结果...'
    }

    // 更新处理消息
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, content: statusText }
        : msg
    ))
  }

  // 处理任务完成事件
  const handleTaskFinished = (data: any, messageId: string) => {
    const { status, gifUrl, error, errorCode, gifFileSize, gifWidth, gifHeight, actualDuration } = data

    // 重置处理状态
    setIsProcessing(false)

    if (status === 'completed' && gifUrl) {
      // 任务成功完成，显示生成的GIF
      const successMessage: Message = {
        id: (Date.now() + 3).toString(),
        type: 'image',
        content: gifUrl,
        timestamp: Date.now(),
        isUser: false
      }

      // 保存生成的作品数据，用于预览弹窗
      const workData: WorkPreviewData = {
        id: successMessage.id,
        gifUrl: gifUrl,
        originalImageUrl: uploadedImage?.url,
        prompt: inputText, // 使用当前的输入文本作为提示词
        createdAt: new Date().toISOString(),
        gifFileSize: gifFileSize,
        gifWidth: gifWidth,
        gifHeight: gifHeight,
        actualDuration: actualDuration
      }

      setGeneratedWorksData(prev => {
        const newMap = new Map(prev)
        newMap.set(successMessage.id, workData)
        return newMap
      })

      // 移除处理消息，添加成功消息
      setMessages(prev => [
        ...prev.filter(msg => msg.id !== messageId),
        successMessage
      ])

      // 显示成功提示
      Taro.showToast({
        title: '生成完成！',
        icon: 'success'
      })
    } else if (status === 'failed') {
      // 任务失败
      const errorMessage = error || '生成失败'
      const errorDetails = errorCode ? ` (错误代码: ${errorCode})` : ''
      
      // 更新处理消息为失败状态
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, content: `生成失败: ${errorMessage}${errorDetails}`, type: 'text' }
          : msg
      ))
      
      Taro.showToast({
        title: '生成失败',
        icon: 'none'
      })
    }
  }

  // 处理任务错误事件
  const handleTaskError = (data: any, messageId: string) => {
    const { error } = data

    // 重置处理状态
    setIsProcessing(false)

    // 更新处理消息为错误状态
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, content: `发生错误: ${error}` }
        : msg
    ))

    Taro.showToast({
      title: '发生错误',
      icon: 'none'
    })
  }

  // 处理连接错误事件
  const handleConnectionError = (error: Error, messageId: string) => {
    
    // 重置处理状态
    setIsProcessing(false)
    
    // 更新处理消息为错误状态
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, content: `连接失败: ${error.message}` }
        : msg
      ))
    
    Taro.showToast({
      title: '连接失败',
      icon: 'none'
    })
  }



  return (
    <View className='workspace' onClick={handlePageClick}>
      {/* 头部LOGO */}
      <View className='header'>
        <View className='creativity-logo'>
          <Text className='creativity-letter c'>C</Text>
          <Text className='creativity-letter r'>R</Text>
          <Text className='creativity-letter e'>E</Text>
          <Text className='creativity-letter a'>A</Text>
          <Text className='creativity-letter t'>T</Text>
          <Text className='creativity-letter i'>I</Text>
          <Text className='creativity-letter v'>V</Text>
          <Text className='creativity-letter i2'>I</Text>
          <Text className='creativity-letter t2'>T</Text>
          <Text className='creativity-letter y'>Y</Text>
        </View>
      </View>

      {/* 主要内容区域 */}
      <View className='main-content'>

        {/* 聊天消息区域 */}
        {messages.length > 0 && (
          <View className='chat-messages'>
            {messages.map((message) => (
              <View 
                key={message.id} 
                className={`message-wrapper ${message.isUser ? 'user-message-wrapper' : 'ai-message-wrapper'}`}
              >
                {!message.isUser && (
                  <View className='ai-avatar'>
                    <Image
                      className='avatar-image'
                      src='https://img.52725.uno/assets/robot-avatar.png'
                      mode='aspectFit'
                      onError={(e) => {
                        // 用小图标替换失败的机器人头像
                        const imgElement = e.currentTarget as HTMLImageElement
                        if (imgElement && imgElement.parentElement) {
                          imgElement.style.display = 'none'
                          const fallbackIcon = document.createElement('span')
                          fallbackIcon.textContent = '🖼️'
                          fallbackIcon.style.fontSize = '16px'
                          fallbackIcon.style.textAlign = 'center'
                          imgElement.parentElement.appendChild(fallbackIcon)
                        }
                      }}
                    />
                  </View>
                )}
                
                <View className={`message-bubble ${message.isUser ? 'chat-bubble-right' : 'chat-bubble-left'} ${message.type === 'image' ? 'image-bubble' : ''} ${message.type === 'demo-card' ? 'demo-bubble' : ''}`}>
                  {message.type === 'text' ? (
                    <Text className='bubble-text'>{message.content}</Text>
                  ) : message.type === 'loading' ? (
                    <View className='ai-input-indicator'>
                      <View className='ai-circle small'></View>
                      <View className='ai-circle medium'></View>
                      <View className='ai-circle large'></View>
                      <View className='ai-circle medium'></View>
                      <View className='ai-circle small'></View>
                    </View>
                  ) : message.type === 'demo-card' ? (
                    <View className='demo-card' onClick={() => handleDemoCardClick(message.id)}>
                      <Text className='demo-card-title'>{message.content}</Text>
                      <View className='demo-video-container'>
{isH5 ? (
                          <>
                            <video 
                              className='demo-video' 
                              src={(message.demoData && message.demoData.videoUrl) || ''} 
                              poster={(demoExample && demoExample.imageUrl) || ''}
                              autoPlay
                              loop
                              muted
                              playsInline
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                display: 'block'
                              }}
                              onError={(e) => {
                                // 隐藏video元素，显示fallback
                                const videoElement = e.target as HTMLVideoElement
                                if (videoElement) {
                                  videoElement.style.display = 'none'
                                  const fallbackElement = (videoElement.parentElement && videoElement.parentElement.querySelector('.demo-video-fallback')) as HTMLDivElement
                                  if (fallbackElement) {
                                    fallbackElement.style.display = 'flex'
                                  }
                                }
                              }}
                            />
                            <View
                              className='demo-video-fallback'
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                display: 'none',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '8px'
                              }}
                            >
                              <Text className='fallback-icon'>🖼️</Text>
                            </View>
                          </>
                        ) : (
                          <Video 
                            className='demo-video' 
                            src={(message.demoData && message.demoData.videoUrl) || ''} 
                            poster={(demoExample && demoExample.imageUrl) || ''}
                            controls={false}
                            autoplay={true}
                            loop={true}
                            muted={true}
                            showPlayBtn={false}
                            showCenterPlayBtn={false}
                            showProgress={false}
                            showFullscreenBtn={false}
                            objectFit='cover'
                          />
                        )}
                      </View>
                      <Text className='demo-prompt'>{message.demoData && message.demoData.prompt}</Text>
                      <View className='demo-action-hint'>
                        <Text className='demo-hint-text'>👆 点击卡片快速体验</Text>
                      </View>
                    </View>
                  ) : message.type === 'image' ? (
                    <AdaptiveImageBubble
                      src={message.content}
                      alt='Generated image'
                      onClick={() => handleImagePreview(message.content, message.id)}
                      isH5={isH5}
                    />
                  ) : (
                    <View className='bubble-unknown-type'>
                      <Text>未知消息类型: {message.type}</Text>
                      <Text>内容: {message.content}</Text>
                    </View>
                  )}
                </View>

                {message.isUser && (
                  <View className='user-avatar'>
                    {(userState.user && userState.user.userAvatar) ? (
                      <Image
                        className='avatar-image'
                        src={userState.user.userAvatar}
                        mode='aspectFit'
                        onError={(e) => {
                          // 用小图标替换失败的用户头像
                          const imgElement = e.currentTarget as HTMLImageElement
                          if (imgElement && imgElement.parentElement) {
                            imgElement.style.display = 'none'
                            const fallbackIcon = document.createElement('span')
                            fallbackIcon.textContent = '🖼️'
                            fallbackIcon.style.fontSize = '16px'
                            fallbackIcon.style.textAlign = 'center'
                            imgElement.parentElement.appendChild(fallbackIcon)
                          }
                        }}
                      />
                    ) : (
                      <Text className='user-icon'>👤</Text>
                    )}
                  </View>
                )}
              </View>
            ))}

          </View>
        )}
        {/* 消息列表底部锚点，用于自动滚动 */}
        <View ref={messagesEndRef} className='messages-end'></View>
      </View>

      {/* 输入区域 */}
      <View className='input-area' style={{ bottom: '0px' }} onClick={(e) => e.stopPropagation()}>
        <View className='input-container'>
          <View className='input-card'>
            {/* 主输入区域 - 横向布局 */}
            <View className='input-main-section'>
              {/* 左侧图片上传按钮/图片显示区域 - 3:4比例长矩形 */}
              <View className='image-upload-btn' onClick={handleChooseImage}>
                {uploadedImage ? (
                  <View className='uploaded-image-container'>
                    <Image
                      className='uploaded-image-display'
                      src={uploadedImage.url}
                      mode='aspectFit'
                      onError={(e) => {
                        // 用小图标替换失败的上传图片预览
                        const imgElement = e.currentTarget as HTMLImageElement
                        if (imgElement && imgElement.parentElement) {
                          imgElement.style.display = 'none'
                          const fallbackIcon = document.createElement('span')
                          fallbackIcon.textContent = '🖼️'
                          fallbackIcon.style.fontSize = '16px'
                          fallbackIcon.style.textAlign = 'center'
                          fallbackIcon.style.display = 'flex'
                          fallbackIcon.style.alignItems = 'center'
                          fallbackIcon.style.justifyContent = 'center'
                          fallbackIcon.style.width = '100%'
                          fallbackIcon.style.height = '100%'
                          imgElement.parentElement.appendChild(fallbackIcon)
                        }
                      }}
                    />
                    <View className='remove-image-btn' onClick={handleRemoveImage}>
                      <Text className='remove-image-icon'>×</Text>
                    </View>
                  </View>
                ) : (
                  <Text className='upload-plus-icon'>+</Text>
                )}
              </View>
              
              {/* 中间文本输入区域 */}
              <View className='text-input-wrapper'>
                <Textarea
                  ref={textareaRef}
                  className='main-text-input'
                  value={inputText}
                  onInput={handleInputChange}
                  placeholder='描述你想要的动画效果...'
                  placeholderClass='main-text-placeholder'
                  maxlength={300}
                  showConfirmBar={false}
                  autoHeight={false}
                  adjustPosition={true}
                  holdKeyboard={true}
                  cursorSpacing={20}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </View>
            </View>
            
            {/* 底部风格选择和发送按钮区域 */}
            <View className='input-bottom-section'>
              <View className='style-selector-wrapper'>
                <View className='style-dropdown' onClick={() => setShowStyleDropdown(!showStyleDropdown)}>
                  <Text className='style-selected'>{getSelectedStyleLabel()}</Text>
                  <Text className='dropdown-arrow'>{showStyleDropdown ? '▲' : '▼'}</Text>
                  
                  {/* 向上弹出的选项列表 */}
                  {showStyleDropdown && generateConfig && generateConfig.styles && (
                    <View className='style-options'>
                      {Object.entries(generateConfig.styles).map(([label, value]) => (
                        <View 
                          key={value}
                          className={`style-option ${selectedStyle === value ? 'selected' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStyleSelect(value)
                          }}
                        >
                          <Text className='style-option-text'>{label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              
              {/* 发送按钮 */}
              <View className='send-button-wrapper'>
                <View
                  className={`function-btn send-btn ${isSending ? 'loading' : ''}`}
                  onClick={handleSendMessage}
                >
                  {isSending ? (
                    <View className='loading-spinner'></View>
                  ) : (
                    <Text className='function-btn-icon'>➤</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 作品预览弹窗 */}
      {previewModalVisible && (
        <Suspense fallback={<View className='modal-loading'>加载中...</View>}>
          <WorkPreviewModal
            isOpened={previewModalVisible}
            workData={selectedWork}
            onClose={handleClosePreviewModal}
            onDownload={handleDownloadFromModal}
          />
        </Suspense>
      )}

    </View>
  )
}
