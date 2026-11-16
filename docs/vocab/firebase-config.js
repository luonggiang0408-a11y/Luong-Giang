/* Cấu hình Firebase (dự án vocab-ielts) để bật đăng nhập Google.
   Các giá trị này là định danh công khai của ứng dụng web, không phải mật khẩu.
   Quyền truy cập dữ liệu được bảo vệ bởi Firestore Rules (chỉ đúng tài khoản Google của chủ sở hữu).
   Để null thì web chạy như cũ, không cần đăng nhập. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBT7cCAEddHscLCWZmAXU1lzRl2g9lrGsw",
  authDomain: "vocab-ielts-cd112.firebaseapp.com",
  projectId: "vocab-ielts-cd112",
  storageBucket: "vocab-ielts-cd112.firebasestorage.app",
  messagingSenderId: "568433737377",
  appId: "1:568433737377:web:4c150603da3d3d5cf5bae0"
};
