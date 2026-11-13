import React, { useEffect, useState } from 'react';

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
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const cleanSrc = typeof src === 'string' && src.trim().length > 0 && !hasError ? src.trim() : null;
  const displayInitials = (initials || 'MB').slice(0, 2).toUpperCase();

  if (cleanSrc) {
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        title={title || (name ? `View ${name}'s photo` : 'View member photo')}
        className={`${sizeClass} rounded-full overflow-hidden shrink-0 ${borderClass} cursor-pointer hover:ring-2 hover:ring-[#6D5CF2] transition-all focus-visible:outline-2 focus-visible:outline-[#6D5CF2]`}
      >
        <img
          src={cleanSrc}
          alt={name || 'Member photo'}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      </button>
    ) : (
      <img
        src={cleanSrc}
        alt={name || 'Member photo'}
        onError={() => setHasError(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${borderClass}`}
      />
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
