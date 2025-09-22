import { PropsWithChildren } from 'react'
import { useLaunch, useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import { UserProvider } from './stores/userStore'

import './app.less'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // 小程序分享给好友
  useShareAppMessage(() => {
    return {
      title: '表情包动起来 - AI驱动动图生成',
      path: '/pages/workspace/index',
      imageUrl: '' // 可以设置分享图片
    }
  })

  // 小程序分享到朋友圈
  useShareTimeline(() => {
    return {
      title: '表情包动起来 - AI驱动动图生成',
      imageUrl: '' // 可以设置分享图片
    }
  })

  // children 是将要会渲染的页面
  return (
    <UserProvider
      requireAuth={true}
      routeWhitelist={[
        '/pages/login/index',
        '/pages/register/index',
        '/pages/workspace/index'
      ]}
    >
      {children}
    </UserProvider>
  )
}

export default App