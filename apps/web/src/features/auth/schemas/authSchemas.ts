import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email không được để trống.')
    .email('Định dạng email không hợp lệ.'),
  password: z
    .string()
    .min(1, 'Mật khẩu không được để trống.'),
  rememberMe: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    fullName: z.string().min(1, 'Họ và tên không được để trống.'),
    phone: z.string().min(10, 'Số điện thoại không hợp lệ.'),
    address: z.string().min(5, 'Địa chỉ quá ngắn.'),
    dateOfBirth: z.string().min(1, 'Vui lòng chọn ngày sinh.'),
    email: z
      .string()
      .min(1, 'Email không được để trống.')
      .email('Định dạng email không hợp lệ.'),
    password: z
      .string()
      .min(8, 'Mật khẩu tối thiểu 8 ký tự.')
      .regex(/[A-Z]/, 'Chứa ít nhất 1 chữ cái viết hoa.')
      .regex(/[a-z]/, 'Chứa ít nhất 1 chữ cái viết thường.')
      .regex(/[0-9]/, 'Chứa ít nhất 1 chữ số.')
      .regex(/[^a-zA-Z0-9]/, 'Chứa ít nhất 1 ký tự đặc biệt.'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu.'),
    agreeTerms: z.boolean().refine((val) => val === true, {
      message: 'Bạn cần đồng ý với điều khoản sử dụng.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email không được để trống.')
    .email('Định dạng email không hợp lệ.'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Mật khẩu tối thiểu 8 ký tự.')
      .regex(/[A-Z]/, 'Chứa ít nhất 1 chữ cái viết hoa.')
      .regex(/[a-z]/, 'Chứa ít nhất 1 chữ cái viết thường.')
      .regex(/[0-9]/, 'Chứa ít nhất 1 chữ số.')
      .regex(/[^a-zA-Z0-9]/, 'Chứa ít nhất 1 ký tự đặc biệt.'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
