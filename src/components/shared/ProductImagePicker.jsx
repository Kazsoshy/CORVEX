import { useEffect, useState } from 'react';

const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function productImageChoiceError(file) {
  const namedOk = /\.(jpe?g|png|webp)$/i.test(file.name || '');
  const typedOk = PRODUCT_IMAGE_TYPES.includes(file.type);
  if ((file.type && !typedOk) || (!file.type && !namedOk)) {
    return 'Choose a JPG, PNG, or WebP image.';
  }
  if (file.size > 2 * 1024 * 1024) return 'Image must be 2 MB or smaller.';
  return '';
}

export function ProductImagePicker({
  currentUrl,
  file,
  removed,
  onFile,
  onRemove,
  showToast,
}) {
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || (!removed && currentUrl ? currentUrl : '');

  const choose = (event) => {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    const message = productImageChoiceError(next);
    if (message) {
      showToast?.(message, 'error');
      return;
    }
    onFile(next);
  };

  return (
    <div className="form-group">
      <label>Product Image</label>
      <div className="product-image-picker">
        {shown ? <img src={shown} alt="" width={96} height={96} /> : <span className="product-image-empty">No image</span>}
        <div className="product-image-actions">
          <label className="button secondary">
            {shown ? 'Change image' : 'Add image'}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={choose}
            />
          </label>
          {shown ? <button className="button ghost" type="button" onClick={onRemove}>Remove image</button> : null}
          <p>JPG, PNG, or WebP, up to 2 MB.</p>
        </div>
      </div>
    </div>
  );
}
