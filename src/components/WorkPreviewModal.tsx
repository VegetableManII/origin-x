import React from 'react';
import { View, Image, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { DownloadManager } from '../utils/downloadManager';
import './WorkPreviewModal.scss';

// 作品预览数据接口
export interface WorkPreviewData {
  id: number | string;
  gifUrl: string;
  originalImageUrl?: string;
  prompt?: string;
  createdAt?: string;
  gifFileSize?: number;
  gifWidth?: number;
  gifHeight?: number;
  actualDuration?: number;
}

// 组件属性接口
interface WorkPreviewModalProps {
  isOpened: boolean;
  workData: WorkPreviewData | null;
  onClose: () => void;
  onDownload?: (workData: WorkPreviewData) => void;
}

// 格式化文件大小
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '未知';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 格式化时间
const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

const WorkPreviewModal: React.FC<WorkPreviewModalProps> = ({
  isOpened,
  workData,
  onClose,
  onDownload
}) => {
  // 下载状态
  const [isDownloading, setIsDownloading] = React.useState(false);

  // 处理下载
  const handleDownload = async () => {
    if (!workData || !workData.gifUrl || isDownloading) return;

    setIsDownloading(true);

    try {
      // 只调用外部下载回调，让外部处理下载逻辑
      if (onDownload) {
        await onDownload(workData);
      } else {
        // 如果没有外部回调，使用内置下载
        await DownloadManager.downloadImage(
          workData.gifUrl,
          DownloadManager.generateFilename(workData.gifUrl, 'work')
        );
      }

    } catch (error) {
      console.error('下载失败:', error);
      Taro.showToast({
        title: '下载失败',
        icon: 'none',
        duration: 2000
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // 处理图片加载错误
  const handleImageError = (e: any) => {
    console.error('图片加载失败:', e);
    Taro.showToast({
      title: '图片加载失败',
      icon: 'none',
      duration: 2000
    });
  };

  // 处理图片预览
  const handleImagePreview = () => {
    if (workData?.gifUrl) {
      Taro.previewImage({
        urls: [workData.gifUrl],
        current: workData.gifUrl
      });
    }
  };

  if (!workData || !isOpened) return null;

  return (
    <View className="work-preview-modal">
      {/* 遮罩层 */}
      <View className="modal-mask" onClick={onClose}></View>

      {/* 弹窗主体 */}
      <View className="modal-container">
        {/* 标题栏 */}
        <View className="modal-header">
          <Text className="modal-title">作品预览</Text>
          <View className="close-btn" onClick={onClose}>
            <Text className="close-icon">×</Text>
          </View>
        </View>

        {/* 内容区域 */}
        <View className="modal-content">
          <View className="work-preview-content">
            {/* GIF图片展示区域 */}
            <View className="image-container">
              {workData.gifUrl ? (
                Taro.getEnv() === Taro.ENV_TYPE.WEB ? (
                  <img
                    className="work-gif"
                    src={workData.gifUrl}
                    alt="Generated work"
                    onError={handleImageError}
                    onClick={handleImagePreview}
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      maxHeight: '400px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                  />
                ) : (
                  <Image
                    className="work-gif"
                    src={workData.gifUrl}
                    mode="aspectFit"
                    onError={handleImageError}
                    onClick={handleImagePreview}
                    showMenuByLongpress={false}
                  />
                )
              ) : (
                <View className="image-placeholder">
                  <Text>图片链接为空</Text>
                </View>
              )}

              {/* 图片信息标签 */}
              <View className="image-info-overlay">
                {workData.gifWidth && workData.gifHeight && (
                  <Text className="image-size">
                    {workData.gifWidth} × {workData.gifHeight}
                  </Text>
                )}
                {workData.actualDuration && (
                  <Text className="image-duration">
                    {workData.actualDuration}s
                  </Text>
                )}
              </View>
            </View>

            {/* 作品详细信息 */}
            <View className="work-details">
              {workData.prompt && (
                <View className="detail-item">
                  <Text className="detail-label">提示词：</Text>
                  <Text className="detail-value prompt-text">{workData.prompt}</Text>
                </View>
              )}

              {workData.createdAt && (
                <View className="detail-item">
                  <Text className="detail-label">创建时间：</Text>
                  <Text className="detail-value">{formatDate(workData.createdAt)}</Text>
                </View>
              )}

              {workData.gifFileSize && (
                <View className="detail-item">
                  <Text className="detail-label">文件大小：</Text>
                  <Text className="detail-value">{formatFileSize(workData.gifFileSize)}</Text>
                </View>
              )}

              {workData.gifWidth && workData.gifHeight && (
                <View className="detail-item">
                  <Text className="detail-label">分辨率：</Text>
                  <Text className="detail-value">
                    {workData.gifWidth} × {workData.gifHeight} 像素
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* 操作按钮 */}
        <View className="modal-actions">
          <Button
            className={`action-btn primary-btn ${isDownloading ? 'loading' : ''}`}
            onClick={handleDownload}
            disabled={isDownloading || !workData.gifUrl}
          >
            {isDownloading ? '下载中...' : '下载'}
          </Button>
        </View>
      </View>
    </View>
  );
};

export default WorkPreviewModal;