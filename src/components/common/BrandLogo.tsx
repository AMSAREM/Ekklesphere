import React from 'react';

export const EKKLESPHERE_LOGO_SRC =
  '/assets/aistudio/ekklesphere-logo-white_9e8885a3.png';

export interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  surface?: 'auto' | 'light' | 'dark';
  className?: string;
  imgClassName?: string;
  alt?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  xs: 'h-5 sm:h-6',
  sm: 'h-6 sm:h-7',
  md: 'h-7 sm:h-8',
  lg: 'h-9 sm:h-11',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'sm',
  surface = 'auto',
  className = '',
  imgClassName = '',
  alt = 'ekklesphere',
}) => {
  // White-on-transparent PNG: render crisp white natively on dark backgrounds,
  // or filter alpha-preserved white artwork to deep ink (#191919) on light backgrounds.
  const toneClass =
    surface === 'dark'
      ? 'brightness-100'
      : surface === 'light'
      ? 'brightness-[0.10]'
      : 'brightness-[0.10] dark:brightness-100';

  return (
    <span className={`inline-flex items-center shrink-0 ${className}`.trim()}>
      <img
        src={EKKLESPHERE_LOGO_SRC}
        alt={alt}
        decoding="async"
        className={`${SIZE_CLASSES[size]} w-auto object-contain select-none ${toneClass} ${imgClassName}`.trim()}
      />
    </span>
  );
};
