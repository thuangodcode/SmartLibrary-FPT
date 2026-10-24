import { API_BASE_URL } from '../../config';
import { parseApiResponse } from '../../lib/api';

export interface InboxNotice {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  href?: string | null;
  createdAt: string;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function callInbox<T>(token: string, path: string, method: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const result = await parseApiResponse<Envelope<T>>(response);
  if (!response.ok || !result?.success || result.data === undefined) {
    throw new Error(result?.error || 'Không tải được thông báo.');
  }
  return result.data;
}

export const listInboxNotices = (token: string) =>
  callInbox<InboxNotice[]>(token, '/api/v1/notifications', 'GET');

export const markInboxNoticeRead = (token: string, id: string) =>
  callInbox<boolean>(token, `/api/v1/notifications/${id}/read`, 'POST');
