import React from 'react';

// Lightweight, optimized GitHub mark
export default function IconGitHub({ size = 36, variant = 'filled', className = '' }) {
  const stroke = variant === 'outlined' ? '#cfe6ff' : 'none';
  const fill = variant === 'filled' ? '#ffffff' : 'none';
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={fill} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.87 10.9.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.95.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.72 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.47.11-3.06 0 0 .96-.31 3.15 1.18.92-.26 1.92-.39 2.91-.39s1.99.13 2.91.39c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.77.11 3.06.73.8 1.18 1.83 1.18 3.09 0 4.45-2.69 5.43-5.25 5.71.41.36.77 1.07.77 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56C20.71 21.38 24 17.08 24 12c0-6.27-5.23-11.5-12-11.5z" fill="#fff" />
    </svg>
  );
}
