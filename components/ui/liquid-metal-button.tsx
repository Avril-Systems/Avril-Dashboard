'use client';

/**
 * Avril button hierarchy (matches agentslanding design system):
 * - LiquidMetalButton — primary CTA (deploy, sign-in, build from idea, nav)
 * - CosmicButton — opportunity / “magic” actions (generate opportunities)
 * - Button (btn-secondary / btn-ghost) — tertiary app actions
 */

import { liquidMetalFragmentShader, ShaderMount } from '@paper-design/shaders';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { avrilTypography } from '@/lib/avril-tokens';
import { cn } from '@/lib/utils';

const SHADER_STYLE_ID = 'avril-shader-canvas-style';

export const METAL_MOTION = {
  default: { idle: 0.6, hover: 1, click: 2.4 },
  calm: { idle: 0.15, hover: 0.6, click: 1.2 },
} as const;

export type MetalMotion = keyof typeof METAL_MOTION;

const SHADER_UNIFORMS = {
  u_repetition: 4,
  u_softness: 0.5,
  u_shiftRed: 0.3,
  u_shiftBlue: 0.3,
  u_distortion: 0,
  u_contour: 0,
  u_angle: 45,
  u_scale: 8,
  /** 0 = responsive canvas border (pill). 1 = circle — only for icon mode. */
  u_shape: 0,
  u_offsetX: 0.1,
  u_offsetY: -0.1,
} as const;

const ICON_SHADER_UNIFORMS = {
  ...SHADER_UNIFORMS,
  u_shape: 1,
} as const;

export type LiquidMetalButtonProps = {
  label?: string;
  onClick?: () => void;
  href?: string;
  viewMode?: 'text' | 'icon';
  size?: 'default' | 'wide' | 'auto';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  /** Slower idle animation — use on marketing hero only */
  motion?: MetalMotion;
};

export function LiquidMetalButton({
  label = 'Get Started',
  onClick,
  href,
  viewMode = 'text',
  size = 'auto',
  className,
  disabled = false,
  type = 'button',
  motion = 'default',
}: LiquidMetalButtonProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const shaderRef = useRef<HTMLDivElement>(null);
  const shaderMount = useRef<{ destroy?: () => void; setSpeed?: (speed: number) => void } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);
  const isIcon = viewMode === 'icon';
  const speeds = METAL_MOTION[motion];

  const shellClassName = cn(
    'relative inline-flex items-center justify-center overflow-hidden rounded-[100px]',
    isIcon ? 'size-[46px]' : 'h-[46px]',
    !isIcon && size === 'default' && 'min-w-[142px] px-5',
    !isIcon && size === 'wide' && 'min-w-[248px] px-8',
    !isIcon && size === 'auto' && 'min-w-[142px] px-7',
  );

  useEffect(() => {
    if (!document.getElementById(SHADER_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = SHADER_STYLE_ID;
      style.textContent = `
        .shader-container-exploded canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 100px !important;
        }
        @keyframes avril-ripple-animation {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const loadShader = () => {
      try {
        if (!shaderRef.current) return;

        shaderMount.current?.destroy?.();

        shaderMount.current = new ShaderMount(
          shaderRef.current,
          liquidMetalFragmentShader,
          isIcon ? ICON_SHADER_UNIFORMS : SHADER_UNIFORMS,
          undefined,
          speeds.idle,
        );
      } catch (error) {
        console.error('[LiquidMetalButton] Failed to load shader:', error);
      }
    };

    loadShader();

    return () => {
      shaderMount.current?.destroy?.();
      shaderMount.current = null;
    };
  }, [isIcon, speeds.idle]);

  const handleMouseEnter = () => {
    if (disabled) return;
    setIsHovered(true);
    shaderMount.current?.setSpeed?.(speeds.hover);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsPressed(false);
    shaderMount.current?.setSpeed?.(speeds.idle);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (shaderMount.current?.setSpeed) {
      shaderMount.current.setSpeed(speeds.click);
      setTimeout(() => {
        if (isHovered) {
          shaderMount.current?.setSpeed?.(speeds.hover);
        } else {
          shaderMount.current?.setSpeed?.(speeds.idle);
        }
      }, 300);
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const ripple = { x, y, id: rippleId.current++ };

      setRipples((prev) => [...prev, ripple]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== ripple.id));
      }, 600);
    }

    onClick?.();

    if (href) {
      router.push(href);
    }
  };

  const pressTransform = isPressed ? 'translateY(1px) scale(0.98)' : 'translateY(0) scale(1)';
  const outerShadow = isPressed
    ? '0px 0px 0px 1px rgba(0, 0, 0, 0.5), 0px 1px 2px 0px rgba(0, 0, 0, 0.3)'
    : isHovered
      ? '0px 0px 0px 1px rgba(0, 0, 0, 0.4), 0px 12px 6px 0px rgba(0, 0, 0, 0.05), 0px 8px 5px 0px rgba(0, 0, 0, 0.1), 0px 4px 4px 0px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.2)'
      : '0px 0px 0px 1px rgba(0, 0, 0, 0.3), 0px 36px 14px 0px rgba(0, 0, 0, 0.02), 0px 20px 12px 0px rgba(0, 0, 0, 0.08), 0px 9px 9px 0px rgba(0, 0, 0, 0.12), 0px 2px 5px 0px rgba(0, 0, 0, 0.15)';

  return (
    <div className={cn('relative inline-flex justify-center', className)}>
      <div
        className={cn(shellClassName, disabled && 'pointer-events-none opacity-55')}
        style={{ perspective: '1000px', perspectiveOrigin: '50% 50%' }}
      >
        {/* Metallic shader — fills shell; ResizeObserver keeps canvas in sync */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ transform: `translateZ(0px) ${pressTransform}`, transformStyle: 'preserve-3d' }}
        >
          <div
            className="absolute inset-0 rounded-[100px]"
            style={{
              boxShadow: outerShadow,
              transition: 'box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div
              ref={shaderRef}
              className="shader-container-exploded absolute inset-0 overflow-hidden rounded-[100px]"
            />
          </div>
        </div>

        {/* Inner fill */}
        <div
          className="pointer-events-none absolute inset-[2px] z-20 rounded-[100px]"
          style={{
            background: 'linear-gradient(180deg, #202020 0%, #000000 100%)',
            boxShadow: isPressed
              ? 'inset 0px 2px 4px rgba(0, 0, 0, 0.4), inset 0px 1px 2px rgba(0, 0, 0, 0.3)'
              : 'none',
            transform: `translateZ(10px) ${pressTransform}`,
            transformStyle: 'preserve-3d',
            transition: 'box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />

        {isIcon ? (
          <Sparkles
            size={16}
            className="pointer-events-none relative z-30 text-neutral-400"
            style={{
              filter: 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.5))',
              transform: 'translateZ(20px)',
            }}
            aria-hidden
          />
        ) : (
          <span
            className={cn(avrilTypography.cta, 'relative z-30 whitespace-nowrap')}
            style={{
              color: '#d4d4d4',
              fontWeight: 500,
              textShadow: '0px 1px 2px rgba(0, 0, 0, 0.5)',
              transform: 'translateZ(20px)',
              transformStyle: 'preserve-3d',
            }}
          >
            {label}
          </span>
        )}

        <button
          ref={buttonRef}
          type={type}
          disabled={disabled}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseDown={() => !disabled && setIsPressed(true)}
          onMouseUp={() => setIsPressed(false)}
          className="absolute inset-0 z-40 cursor-pointer rounded-[100px] border-0 bg-transparent outline-none disabled:cursor-not-allowed"
          style={{ transform: 'translateZ(25px)', transformStyle: 'preserve-3d' }}
          aria-label={label}
        >
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="pointer-events-none absolute rounded-full"
              style={{
                left: `${ripple.x}px`,
                top: `${ripple.y}px`,
                width: '20px',
                height: '20px',
                background:
                  'radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%)',
                animation: 'avril-ripple-animation 0.6s ease-out',
              }}
            />
          ))}
        </button>
      </div>
    </div>
  );
}
