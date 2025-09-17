import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import './RechargeModal.less'

interface RechargeOption {
  id: string
  name: string
  points: number
  amount: number // 金额，单位为分
  logoUrl: string // logo图片地址
  discount?: string // 折扣标识，如 "85折"
  isPopular?: boolean // 是否热门套餐
}

interface RechargeModalProps {
  isOpened: boolean
  onClose: () => void
  onConfirm: (option: RechargeOption) => void
}

const rechargeOptions: RechargeOption[] = [
  {
    id: 'small',
    name: '小碗',
    points: 1000,
    amount: 1000, // 10元
    logoUrl: 'https://img.52725.uno/small-removebg-preview.png'
  },
  {
    id: 'medium',
    name: '中碗',
    points: 3000,
    amount: 2550, // 25.5元
    logoUrl: 'https://img.52725.uno/mid-removebg-preview.png',
    discount: '85折',
    isPopular: true
  },
  {
    id: 'large',
    name: '大碗',
    points: 7000,
    amount: 4900, // 49元
    logoUrl: 'https://img.52725.uno/large-removebg-preview.png',
    discount: '7折'
  }
]

export default function RechargeModal({ isOpened, onClose, onConfirm }: RechargeModalProps) {
  const [selectedOption, setSelectedOption] = useState<RechargeOption | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isOpened) return null

  const handleOptionSelect = (option: RechargeOption) => {
    setSelectedOption(option)
  }

  const handleConfirm = async () => {
    if (!selectedOption) {
      Taro.showToast({
        title: '请选择充值项目',
        icon: 'none'
      })
      return
    }

    if (isConfirming) return

    setIsConfirming(true)
    try {
      await onConfirm(selectedOption)
    } catch (error) {
      // 错误处理由父组件处理
    } finally {
      setIsConfirming(false)
    }
  }

  const handleClose = () => {
    if (isConfirming) return
    setSelectedOption(null)
    onClose()
  }

  const formatAmount = (amount: number) => {
    return (amount / 100).toFixed(2)
  }

  return (
    <View className='recharge-modal'>
      <View className='recharge-overlay' onClick={handleClose}></View>
      <View className='recharge-content'>
        <View className='recharge-header'>
          <Text className='recharge-title'>充值余额</Text>
          <View className='recharge-close' onClick={handleClose}>
            <Text className='close-icon'>×</Text>
          </View>
        </View>

        <View className='recharge-options'>
          {rechargeOptions.map((option) => (
            <View
              key={option.id}
              className={`recharge-option ${selectedOption?.id === option.id ? 'selected' : ''} ${option.isPopular ? 'popular' : ''}`}
              onClick={() => handleOptionSelect(option)}
            >
              {/* 折扣标签 */}
              {option.discount && (
                <View className='discount-tag'>
                  <Text className='discount-text'>{option.discount}</Text>
                </View>
              )}

              {/* 热门标签 */}
              {option.isPopular && (
                <View className='popular-tag'>
                  <Text className='popular-text'>推荐</Text>
                </View>
              )}

              <View className='option-logo'>
                <Image
                  className='logo-image'
                  src={option.logoUrl}
                  mode='aspectFit'
                  onError={(e) => {
                    // 图片加载失败时显示默认图标
                    const imgElement = e.currentTarget as HTMLImageElement
                    if (imgElement && imgElement.parentElement) {
                      imgElement.style.display = 'none'
                      const fallbackIcon = document.createElement('span')
                      fallbackIcon.textContent = '🥣'
                      fallbackIcon.style.fontSize = '24px'
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
              </View>
              <View className='option-content'>
                <Text className='option-name'>{option.name}</Text>
                <Text className='option-amount'>¥{formatAmount(option.amount)}</Text>
              </View>
              <View className='option-right'>
                <Text className='option-points'>{option.points}</Text>
                <View className='option-check'>
                  {selectedOption?.id === option.id && (
                    <Text className='check-icon'>✓</Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>

        <View className='recharge-actions'>
          <View className='action-btn cancel-btn' onClick={handleClose}>
            <Text className='btn-text'>取消</Text>
          </View>
          <View
            className={`action-btn confirm-btn ${isConfirming ? 'loading' : ''} ${!selectedOption ? 'disabled' : ''}`}
            onClick={handleConfirm}
          >
            {isConfirming ? (
              <View className='loading-spinner'></View>
            ) : (
              <Text className='btn-text'>确认充值</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

export type { RechargeOption }