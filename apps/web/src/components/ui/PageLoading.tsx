import { LoaderCircle } from 'lucide-react';
import './PageLoading.css';

export default function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <LoaderCircle className="page-loading-spinner" size={24} aria-hidden="true" />
      <span>Loading...</span>
    </div>
  );
}
