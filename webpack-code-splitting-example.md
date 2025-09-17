# Webpack 代码分割方法

## 1. 动态导入 (Dynamic Imports)

### 组件懒加载
```javascript
// 原来的方式
import RechargeModal from '../../components/RechargeModal'

// 代码分割方式
const RechargeModal = React.lazy(() => import('../../components/RechargeModal'))

// 使用时需要包装在 Suspense 中
<Suspense fallback={<div>Loading...</div>}>
  <RechargeModal />
</Suspense>
```

### 按需加载工具库
```javascript
// 原来的方式
import { DownloadManager } from '../../utils/downloadManager'

// 代码分割方式
const handleDownload = async () => {
  const { DownloadManager } = await import('../../utils/downloadManager')
  await DownloadManager.downloadImage(url)
}
```

## 2. 路由级别的代码分割

```javascript
// 在 Taro 中使用懒加载页面
const Workspace = React.lazy(() => import('./pages/workspace'))
const Profile = React.lazy(() => import('./pages/profile'))
```

## 3. 第三方库分割

### webpack 配置
```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          enforce: true,
        },
      },
    },
  },
}
```

## 4. Taro 特定优化

### 分包配置 (小程序环境)
```javascript
// app.config.js
export default {
  subPackages: [
    {
      root: 'pages/workspace',
      pages: ['index']
    },
    {
      root: 'pages/profile',
      pages: ['index']
    }
  ]
}
```

### 按需引入组件库
```javascript
// 不好的方式
import { Button, Modal, Toast } from '@tarojs/components'

// 好的方式 - 按需引入
import Button from '@tarojs/components/dist/components/button'
import Modal from '@tarojs/components/dist/components/modal'
```

## 5. 具体优化建议

### 针对你的项目：

1. **RechargeModal 组件懒加载**
```javascript
const RechargeModal = React.lazy(() => import('../../components/RechargeModal'))
```

2. **WorkPreviewModal 组件懒加载**
```javascript
const WorkPreviewModal = React.lazy(() => import('../../components/WorkPreviewModal'))
```

3. **服务类按需加载**
```javascript
// 只在需要时加载
const handleRecharge = async () => {
  const { RechargeService } = await import('../../services/recharge')
  const { PaymentManager } = await import('../../utils/paymentManager')
  // 使用服务...
}
```

4. **图片处理工具按需加载**
```javascript
const handleImageUpload = async () => {
  const { H5UploadUtils } = await import('../../utils/h5Upload')
  // 使用工具...
}
```

## 6. 监控分割效果

```bash
# 构建时查看包大小分析
npx webpack-bundle-analyzer dist/static/js/*.js
```

这些方法可以显著减少初始包大小，提升加载性能。