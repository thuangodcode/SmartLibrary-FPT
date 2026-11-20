import type { User } from './types';

export function canUseMobileSession(user: User) {
  if (user.role === 'Librarian') return user.status === 'Active';
  return user.role === 'Reader' && ['Active', 'PendingVerification', 'PendingActivation', 'PendingDocuments', 'PendingApproval', 'Rejected'].includes(user.status);
}

export const needsReaderVerification = (user: User) => user.role === 'Reader'
  && (user.status !== 'Active' || user.isVerified === false);

type ProfileState = { accountStatus?: string | null; registrationStatus?: string | null; isVerified?: boolean };
type ProfileSession = Pick<User, 'email' | 'fullName' | 'avatarUrl' | 'isVerified' | 'phone' | 'address' | 'dateOfBirth'> & ProfileState;
export function profileSessionPatch(profile: ProfileSession) {
  const { email, fullName, avatarUrl, isVerified, phone, address, dateOfBirth, accountStatus } = profile;
  return { email, fullName, avatarUrl, isVerified, phone, address, dateOfBirth, ...(accountStatus ? { status: accountStatus } : {}) };
}

export function readerVerificationMessage(profile: ProfileState, user: User) {
  const status = profile.accountStatus ?? user.status;
  if (status === 'PendingApproval' || profile.registrationStatus === 'Submitted') return {
    title: 'Hồ sơ đang chờ thủ thư duyệt',
    body: 'Bạn đã gửi thông tin và giấy tờ. Tài khoản chỉ được kích hoạt sau khi thủ thư phê duyệt.',
    canSubmit: false,
  };
  if (status === 'Rejected' || profile.registrationStatus === 'Rejected') return {
    title: 'Hồ sơ chưa được chấp nhận',
    body: 'Kiểm tra lý do từ chối, chỉnh sửa thông tin hoặc giấy tờ và gửi lại để thủ thư xét duyệt.',
    canSubmit: true,
  };
  if (profile.registrationStatus === 'NeedMoreInfo') return {
    title: 'Hồ sơ cần bổ sung thông tin',
    body: 'Bổ sung thông tin và ảnh giấy tờ theo yêu cầu của thủ thư rồi gửi lại hồ sơ.',
    canSubmit: true,
  };
  if (status === 'Active' && profile.isVerified === true) return {
    title: 'Tài khoản đã xác thực', body: 'Bạn có thể sử dụng các dịch vụ độc giả theo chính sách thư viện.', canSubmit: false,
  };
  return {
    title: 'Hoàn tất xác thực tài khoản',
    body: 'Bổ sung số điện thoại, ngày sinh, địa chỉ, ảnh giấy tờ hai mặt và ảnh chân dung, sau đó gửi hồ sơ để thủ thư duyệt.',
    canSubmit: true,
  };
}
