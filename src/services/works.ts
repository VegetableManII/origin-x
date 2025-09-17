import { RequestService } from '../utils/request';
import { UserWorksResponse, UserWorksParams } from '../../types/auth';

/**
 * 用户作品相关服务
 */
export class WorksService {
  /**
   * 获取用户历史记录
   * @param params 分页参数
   * @returns 用户历史记录列表
   */
  static async getUserWorks(params?: UserWorksParams): Promise<UserWorksResponse> {
    const queryParams = new URLSearchParams();

    if (params && params.pageNo) {
      queryParams.append('pageNo', params.pageNo.toString());
    }
    if (params && params.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }

    const url = `/users/works/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    return RequestService.get<UserWorksResponse>(url);
  }

  /**
   * 获取用户历史记录（分页）
   * @param pageNo 页码，从1开始
   * @param pageSize 每页数量
   * @returns 用户历史记录列表
   */
  static async getUserWorksWithPagination(pageNo: number = 1, pageSize: number = 4): Promise<UserWorksResponse> {
    return this.getUserWorks({ pageNo, pageSize });
  }
}
