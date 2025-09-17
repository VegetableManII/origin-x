import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'origin-x',
    date: '2025-8-28',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      "@tarojs/plugin-generator"
    ],
    defineConstants: {
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[contenthash:8].js',
        chunkFilename: 'js/[name].[contenthash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[contenthash:8].css',
        chunkFilename: 'css/[name].[contenthash:8].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)

        // 配置代码分割优化
        chain.optimization.splitChunks({
          chunks: 'all',
          minSize: 20000,
          maxSize: 200000, // 200KB 限制，更严格
          cacheGroups: {
            // React 生态系统
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|@types\/react)[\\/]/,
              name: 'react',
              priority: 30,
              chunks: 'all',
            },
            // Taro 核心
            taroCore: {
              test: /[\\/]node_modules[\\/]@tarojs[\\/](taro|runtime|router|cli)[\\/]/,
              name: 'taro-core',
              priority: 25,
              chunks: 'all',
            },
            // Taro 组件
            taroComponents: {
              test: /[\\/]@tarojs[\\/]components[\\/]/,
              name: 'taro-components',
              priority: 20,
              chunks: 'all',
            },
            // Core-js polyfills
            coreJs: {
              test: /[\\/]node_modules[\\/]core-js[\\/]/,
              name: 'core-js',
              priority: 25,
              chunks: 'all',
            },
            // 其他第三方库 - 分成多个小包
            vendor1: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                // 根据包名生成不同的chunk名
                const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
                // 将包名转换为安全的chunk名
                return `vendor-${packageName.replace('@', '').replace('/', '-')}`;
              },
              priority: 10,
              chunks: 'all',
              maxSize: 150000, // 150KB 限制每个vendor包
            },
            // 项目公共代码
            common: {
              name: 'common',
              minChunks: 2,
              priority: 5,
              chunks: 'all',
              enforce: true,
              maxSize: 100000, // 100KB 限制
            },
            // 异步加载的服务
            services: {
              test: /[\\/]src[\\/]services[\\/]/,
              name: 'services',
              priority: 15,
              chunks: 'async',
            },
            // 异步加载的工具
            utils: {
              test: /[\\/]src[\\/]utils[\\/]/,
              name: 'utils',
              priority: 15,
              chunks: 'async',
            },
            // 异步加载的组件
            components: {
              test: /[\\/]src[\\/]components[\\/]/,
              name: 'components',
              priority: 15,
              chunks: 'async',
            }
          }
        })

        // 性能提示配置
        chain.performance
          .maxAssetSize(200000) // 200KB
          .maxEntrypointSize(500000) // 500KB - 允许多个小包的总和
          .hints('warning') // 只显示警告，不阻止构建
      }
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }

  process.env.BROWSERSLIST_ENV = process.env.NODE_ENV

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
