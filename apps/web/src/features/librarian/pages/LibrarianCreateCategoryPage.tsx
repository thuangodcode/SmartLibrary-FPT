import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileImage,
  X,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import './LibrarianCreateCategoryPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5278';

const LibrarianCreateCategoryPage: React.FC = () => {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle file selection from local PC
  const handleFileChange = (file: File | null) => {
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Định dạng tệp không hợp lệ. Vui lòng chọn ảnh JPG, PNG, WEBP hoặc GIF.');
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Dung lượng ảnh vượt quá 10MB. Vui lòng chọn ảnh có kích thước nhỏ hơn.');
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);

    // Create local object URL for preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Submit form with multipart/form-data to Cloudinary & Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage('Vui lòng nhập tên danh mục sách.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('Name', trimmedName);
      if (description.trim()) {
        formData.append('Description', description.trim());
      }
      if (selectedFile) {
        formData.append('Image', selectedFile);
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      // Note: Do NOT set Content-Type header so the browser sets boundary automatically

      const res = await fetch(`${API_BASE_URL}/api/v1/categories`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Không thể tạo danh mục sách.');
      }

      showToast({
        type: 'success',
        title: 'Thành công',
        message: `Đã tạo danh mục sách "${trimmedName}" thành công!`,
      });

      setSuccessMessage(`Đã tạo danh mục "${trimmedName}" thành công! Đang chuyển hướng...`);
      setTimeout(() => {
        navigate('/librarian/books');
      }, 1000);
    } catch (err: unknown) {
      console.error('Error creating category:', err);
      const errText = err instanceof Error
        ? err.message
        : 'Có lỗi xảy ra khi tạo danh mục sách. Vui lòng kiểm tra lại kết nối.';
      setErrorMessage(errText);
      showToast({
        type: 'error',
        title: 'Không thể tạo danh mục',
        message: errText,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lib-create-cat-page">
      {/* Top Breadcrumb & Back */}
      <div className="lib-create-cat-nav">
        <button
          type="button"
          className="lib-create-cat-btn-back"
          onClick={() => navigate('/librarian/books')}
        >
          <ArrowLeft size={16} />
          <span>Quay lại danh mục sách</span>
        </button>

        <div className="lib-create-cat-breadcrumb">
          <span>Thủ thư</span>
          <span>/</span>
          <span>Sách & Biên mục</span>
          <span>/</span>
          <strong>Thêm danh mục mới</strong>
        </div>
      </div>

      {/* Main Form Container */}
      <div className="lib-create-cat-card">
        <header className="lib-create-cat-header">
          <div className="lib-create-cat-header-icon">
            <Layers size={26} />
          </div>
          <div>
            <h1>Thêm danh mục sách mới</h1>
            <p>
              Tạo danh mục mới để phân loại các đầu sách trong thư viện. Hình ảnh được chọn từ máy sẽ tự động tải lên dịch vụ Cloudinary.
            </p>
          </div>
        </header>

        {/* Feedback alerts */}
        {errorMessage && (
          <div className="lib-create-cat-alert error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="lib-create-cat-alert success">
            <CheckCircle2 size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="lib-create-cat-form">
          {/* Category Name */}
          <div className="lib-create-cat-form-group">
            <label htmlFor="cat-name">
              Tên danh mục sách <span className="required">*</span>
            </label>
            <input
              id="cat-name"
              type="text"
              placeholder="Ví dụ: Công nghệ thông tin & Trí tuệ nhân tạo..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              autoFocus
              required
            />
            <span className="lib-create-cat-help">
              Tên danh mục nên ngắn gọn, súc tích và bao quát nhóm đầu sách (Tối đa 255 ký tự).
            </span>
          </div>

          {/* Category Description */}
          <div className="lib-create-cat-form-group">
            <label htmlFor="cat-desc">Mô tả danh mục</label>
            <textarea
              id="cat-desc"
              rows={4}
              placeholder="Nhập tóm tắt mô tả nội dung, chuyên ngành hoặc định hướng của các đầu sách thuộc danh mục này..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category Image - Upload from PC to Cloudinary */}
          <div className="lib-create-cat-form-group">
            <label>
              Hình ảnh đại diện danh mục
              <span className="optional">(Chọn tệp từ máy tính)</span>
            </label>

            {/* Hidden native input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            {!previewUrl ? (
              /* Dropzone */
              <div
                className={`lib-create-cat-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="lib-create-cat-dropzone-icon">
                  <UploadCloud size={36} />
                </div>
                <div className="lib-create-cat-dropzone-text">
                  <strong>Nhấp để chọn ảnh từ thư mục máy tính</strong>
                  <span>hoặc kéo thả tệp hình ảnh vào khu vực này</span>
                </div>
                <div className="lib-create-cat-dropzone-badges">
                  <span>Hỗ trợ: JPG, PNG, WEBP, GIF</span>
                  <span>Tối đa: 10 MB</span>
                  <span className="badge-cloud">⚡ Cloudinary Upload</span>
                </div>
              </div>
            ) : (
              /* Preview Area */
              <div className="lib-create-cat-preview-box">
                <div className="lib-create-cat-preview-img-wrapper">
                  <img src={previewUrl} alt="Preview" className="lib-create-cat-preview-img" />
                </div>

                <div className="lib-create-cat-preview-details">
                  <div className="lib-create-cat-preview-file-info">
                    <FileImage size={20} className="file-icon" />
                    <div>
                      <strong>{selectedFile?.name}</strong>
                      <span>
                        {selectedFile && (selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile?.type}
                      </span>
                    </div>
                  </div>

                  <div className="lib-create-cat-cloud-badge">
                    <Sparkles size={14} />
                    <span>Tệp sẽ được tải trực tiếp lên Cloudinary khi bấm Lưu</span>
                  </div>

                  <div className="lib-create-cat-preview-actions">
                    <button
                      type="button"
                      className="lib-create-cat-btn-change"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Chọn ảnh khác
                    </button>
                    <button
                      type="button"
                      className="lib-create-cat-btn-remove"
                      onClick={handleRemoveFile}
                    >
                      <X size={15} />
                      <span>Gỡ ảnh</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="lib-create-cat-note">
              <Info size={14} />
              <span>
                Hình ảnh đẹp sẽ giúp trang danh mục sách trực quan, sinh động hơn đối với Thủ thư và Độc giả.
              </span>
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="lib-create-cat-form-actions">
            <button
              type="button"
              className="lib-create-cat-btn-cancel"
              onClick={() => navigate('/librarian/books')}
              disabled={submitting}
            >
              Hủy bỏ
            </button>

            <button
              type="submit"
              className="lib-create-cat-btn-submit"
              disabled={submitting || !name.trim()}
            >
              {submitting ? (
                <>
                  <div className="lib-create-cat-btn-spinner" />
                  <span>Đang tải ảnh lên Cloudinary & lưu...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Lưu danh mục sách</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LibrarianCreateCategoryPage;
