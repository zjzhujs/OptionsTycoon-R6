import React, { useState, useRef, useEffect } from 'react';

export interface TooltipProps {
  title?: string;
  content: string;
  subtext?: string;
  children?: React.ReactNode;
  inline?: boolean;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  title,
  content,
  subtext,
  children,
  inline = false,
  placement = 'top',
  className = '',
}) => {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  // Click outside to dismiss on mobile
  useEffect(() => {
    if (!visible) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [visible]);

  return (
    <span
      ref={triggerRef}
      className={`app-tooltip-container ${inline ? 'inline-tooltip' : ''} ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={(e) => {
        if (!children) {
          e.stopPropagation();
          setVisible((prev) => !prev);
        }
      }}
    >
      {children || (
        <span className="tooltip-info-badge" aria-label="说明" title="点击或悬停查看说明">
          ℹ
        </span>
      )}

      {visible && (
        <span className={`app-tooltip-bubble placement-${placement}`} role="tooltip">
          {title && <span className="tooltip-title">{title}</span>}
          <span className="tooltip-text">{content}</span>
          {subtext && <span className="tooltip-subtext">{subtext}</span>}
        </span>
      )}
    </span>
  );
};

export interface InfoButtonProps {
  title: string;
  content: string;
  subtext?: string;
  size?: number;
}

export const InfoIcon: React.FC<InfoButtonProps> = ({ title, content, subtext }) => {
  return (
    <Tooltip title={title} content={content} subtext={subtext} inline>
      <span className="info-icon-badge" aria-label="查看说明">
        ?
      </span>
    </Tooltip>
  );
};
