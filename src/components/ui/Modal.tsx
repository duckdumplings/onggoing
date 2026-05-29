import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
export type ModalVariant = 'center' | 'fullscreen';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 중앙 정렬 카드(center) 또는 전체 화면(fullscreen) */
  variant?: ModalVariant;
  /** center variant의 최대 폭 */
  size?: ModalSize;
  /** 기본 헤더 바의 제목. header를 주면 무시된다. */
  title?: string;
  /** 커스텀 헤더 노드(좌측 영역). 닫기 버튼은 Modal이 우측에 렌더한다. */
  header?: React.ReactNode;
  /** 하단 푸터 노드. border-t 영역에 렌더된다. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  /** 모달 컨테이너에 추가할 클래스 */
  className?: string;
  /** 스크롤 본문 영역 클래스 (기본 p-6) */
  bodyClassName?: string;
  /** 헤더 영역 클래스 */
  headerClassName?: string;
  'aria-label'?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Modal — 공용 모달 셸
 *
 * 공유 동작: 오버레이(glass-overlay) / ESC 닫기 / 오버레이 클릭 닫기 /
 * 포커스 트랩 / 포커스 복원 / body 스크롤 락.
 *
 * 사용 방식
 * - 간단 다이얼로그: title + children (+ footer) → 기본 헤더/본문/푸터 크롬 렌더
 * - 커스텀 레이아웃: title/header 없이 children만 → 컨테이너 안에 그대로 렌더
 *
 * 룰: .cursor/rules/30-anti-slop-design.mdc §1(토큰) §4(lucide)
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  variant = 'center',
  size = 'md',
  title,
  header,
  footer,
  children,
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
  bodyClassName,
  headerClassName,
  'aria-label': ariaLabel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeydown);

    // body 스크롤 락
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 초기 포커스
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && closeOnOverlayClick) {
      onClose();
    }
  };

  const hasChrome = Boolean(title || header || footer);

  const closeButton = showCloseButton && (
    <button
      type="button"
      onClick={onClose}
      className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="모달 닫기"
    >
      <X className="w-5 h-5" />
    </button>
  );

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayClick}
      className={cn(
        'fixed inset-0 z-50 glass-overlay',
        variant === 'fullscreen' ? 'overflow-hidden' : 'flex items-center justify-center p-4',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        role="document"
        className={cn(
          'bg-card text-card-foreground flex flex-col overflow-hidden',
          variant === 'fullscreen'
            ? 'w-full h-full'
            : cn('rounded-2xl shadow-2xl w-full mx-4 max-h-[90vh]', sizeClasses[size]),
          className,
        )}
      >
        {hasChrome ? (
          <>
            {(title || header || showCloseButton) && (
              <div
                className={cn(
                  'flex items-center justify-between gap-4 p-6 border-b border-border',
                  headerClassName,
                )}
              >
                {header ?? (
                  title ? (
                    <h2 id="modal-title" className="text-lg font-semibold text-foreground">
                      {title}
                    </h2>
                  ) : (
                    <span />
                  )
                )}
                {closeButton}
              </div>
            )}
            <div className={cn('flex-1 overflow-y-auto', bodyClassName ?? 'p-6')}>{children}</div>
            {footer && (
              <div className="p-4 border-t border-border flex justify-end gap-2">{footer}</div>
            )}
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default Modal;
