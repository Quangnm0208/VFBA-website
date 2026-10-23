/** Vietnamese wording of the portal. One place, so the words stay consistent and testable. */
export const KINDS: Array<{ value: string; label: string }> = [
  { value: 'membership', label: 'Hội viên' },
  { value: 'newsletter', label: 'Bản tin' },
  { value: 'contact', label: 'Liên hệ' },
];
export const kindLabel = (kind: string) => KINDS.find((k) => k.value === kind)?.label ?? kind;

export const STATUSES: Array<{ value: string; label: string; tone: 'default' | 'primary' | 'caution' | 'positive' }> = [
  { value: 'new', label: 'Mới', tone: 'primary' },
  { value: 'contacted', label: 'Đang xử lý', tone: 'caution' },
  { value: 'closed', label: 'Đã đóng', tone: 'positive' },
  { value: 'qualified', label: 'Đủ điều kiện', tone: 'default' },
  { value: 'unsubscribed', label: 'Đã huỷ nhận tin', tone: 'default' },
];
export const statusLabel = (status: string) => STATUSES.find((s) => s.value === status)?.label ?? status;
export const statusTone = (status: string) => STATUSES.find((s) => s.value === status)?.tone ?? 'default';
/** The statuses a person can set (New -> In progress -> Closed, and back). */
export const WORKFLOW = ['new', 'contacted', 'closed'] as const;
export const roleLabel = (role: string) => (role === 'admin' ? 'Quản trị viên' : 'Nhân viên');

const FORMAT = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export const formatTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : FORMAT.format(date);
};

/** What a person reads for each answer code of the portal API. Never the raw code, never a server message. */
export function errorText(code: string, status = 0): string {
  switch (code) {
    case 'no_token':
    case 'unauthorized':
      return 'Phiên đăng nhập Sanity đã hết hạn hoặc không hợp lệ. Hãy đăng xuất rồi đăng nhập lại.';
    case 'not_staff':
      return 'Tài khoản Sanity của bạn chưa được cấp quyền quản lý Lead. Hãy nhờ quản trị viên thêm email của bạn vào mục “Quản trị nhân sự”.';
    case 'not_allowed':
      return 'Loại tài khoản này không được dùng để quản lý Lead (cần tài khoản người dùng, là thành viên dự án, có email).';
    case 'forbidden':
      return 'Chỉ quản trị viên được dùng chức năng này.';
    case 'identity_unavailable':
      return 'Chưa kiểm tra được danh tính với Sanity lúc này. Vui lòng thử lại sau vài giây.';
    case 'not_here':
      return 'Công cụ này chỉ hoạt động trong Cổng quản trị VBFA (địa chỉ Vercel), không hoạt động trong Studio lưu trữ tại sanity.studio.';
    case 'not_found':
      return 'Không tìm thấy khách này hoặc bạn không có quyền xem.';
    case 'conflict':
      return 'Trạng thái vừa được người khác thay đổi. Danh sách đã được tải lại, hãy kiểm tra rồi thử lại.';
    case 'locked':
      return 'Khách này đã huỷ nhận tin hoặc đã bị xoá nên không đổi trạng thái được.';
    case 'last_admin':
      return 'Không thể gỡ quản trị viên cuối cùng.';
    case 'self_reset':
      return 'Bạn không thể tự đặt lại liên kết của mình: hãy nhờ một quản trị viên khác.';
    case 'note_invalid':
      return 'Ghi chú cần từ 1 đến 2000 ký tự.';
    case 'bad_input':
      return 'Dữ liệu chưa hợp lệ. Hãy kiểm tra lại các ô đã nhập.';
    case 'network':
      return 'Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.';
    default:
      return status >= 500 ? 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.' : 'Có lỗi xảy ra. Vui lòng thử lại.';
  }
}
