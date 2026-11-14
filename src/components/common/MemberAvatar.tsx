import React, { useEffect, useMemo, useState } from 'react';
import {
  getImageFallbackUrls,
  rememberWorkingImageUrl,
  type ImageSizeHint,
} from '../../utils/imageUrl';

interface MemberAvatarProps {
  src?: string | null;
  name?: string;
  initials?: string;
  sizeClass?: string;
  textClass?: string;
  bgClass?: string;
  borderClass?: string;
  onClick?: () => void;
  title?: string;
  sizeHint?: ImageSizeHint;
  onImageStatusChange?: (status: 'idle' | 'loaded' | 'failed') => void;
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  src,
  name,
  initials = 'MB',
  sizeClass = 'w-8 h-8',
  textClass = 'text-xs font-bold',
  bgClass = 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]',
  borderClass = 'border border-[#E3E5F2] dark:border-[#2D2D55]',
  onClick,
  title,
  sizeHint = 'thumb',
  onImageStatusChange,
}) => {
  const candidates = useMemo(() => getImageFallbackUrls(src, sizeHint), [src, sizeHint]);
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    setAttemptIndex(0);
    if (candidates.length === 0) {
      onImageStatusChange?.('idle');
    }
  }, [src, sizeHint, candidates.length]);

  const resolvedSrc = attemptIndex < candidates.length ? candidates[attemptIndex] : null;
  const displayInitials = (initials || 'MB').slice(0, 2).toUpperCase();

  const handleImageLoad = () => {
    if (resolvedSrc) {
      rememberWorkingImageUrl(src, sizeHint, resolvedSrc);
    }
    onImageStatusChange?.('loaded');
  };

  const handleImageError = () => {
    setAttemptIndex((prev) => {
      const next = prev + 1;
      if (next >= candidates.length) {
        onImageStatusChange?.('failed');
      }
      return next;
    });
  };

  if (resolvedSrc) {
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        title={title || (name ? `View ${name}'s photo` : 'View member photo')}
        className={`${sizeClass} rounded-full overflow-hidden shrink-0 ${borderClass} cursor-pointer hover:ring-2 hover:ring-[#6D5CF2] transition-all focus-visible:outline-2 focus-visible:outline-[#6D5CF2]`}
      >
        <img
          src={resolvedSrc}
          alt={name || 'Member photo'}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageError}
          className="w-full h-full object-cover"
        />
      </button>
    ) : (
      <img
        src={resolvedSrc}
        alt={name || 'Member photo'}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onLoad={handleImageLoad}
        onError={handleImageError}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${borderClass}`}
      />
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || (name ? `View ${name}'s image URL` : 'View image URL')}
        className={`${sizeClass} rounded-full ${bgClass} ${textClass} ${borderClass} flex items-center justify-center shrink-0 select-none cursor-pointer hover:ring-2 hover:ring-[#6D5CF2] transition-all focus-visible:outline-2 focus-visible:outline-[#6D5CF2]`}
      >
        {displayInitials}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={`${sizeClass} rounded-full ${bgClass} ${textClass} ${borderClass} flex items-center justify-center shrink-0 select-none`}
    >
      {displayInitials}
    </span>
  );
};
