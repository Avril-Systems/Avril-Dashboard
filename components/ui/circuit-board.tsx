'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CircuitNode {
  id: string;
  x: number;
  y: number;
  label?: string;
  icon?: React.ReactNode;
  status?: 'active' | 'inactive' | 'processing' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

interface CircuitConnection {
  from: string;
  to: string;
  animated?: boolean;
  bidirectional?: boolean;
  color?: string;
  pulseColor?: string;
}

interface CircuitBoardProps extends React.HTMLAttributes<HTMLDivElement> {
  nodes: CircuitNode[];
  connections: CircuitConnection[];
  width?: number;
  height?: number;
  gridSize?: number;
  showGrid?: boolean;
  gridColor?: string;
  traceColor?: string;
  pulseColor?: string;
  nodeColor?: string;
  pulseSpeed?: number;
  traceWidth?: number;
  variant?: 'light' | 'dark' | 'auto';
}

function CircuitBoard({
  nodes,
  connections,
  width = 600,
  height = 400,
  gridSize = 20,
  showGrid = true,
  gridColor,
  traceColor,
  pulseColor,
  nodeColor,
  pulseSpeed = 2,
  traceWidth = 2,
  variant = 'dark',
  className,
  ...props
}: CircuitBoardProps) {
  const isDark = variant !== 'light';

  const computedGridColor = gridColor || (isDark ? 'rgba(0, 153, 175, 0.1)' : 'rgba(0, 153, 175, 0.15)');
  const computedTraceColor = traceColor || (isDark ? 'rgba(0, 153, 175, 0.28)' : 'rgba(0, 122, 140, 0.35)');
  const computedPulseColor = pulseColor || (isDark ? 'rgba(0, 153, 175, 0.85)' : 'rgba(0, 153, 175, 0.75)');
  const computedNodeColor = nodeColor || (isDark ? 'rgba(0, 153, 175, 0.55)' : 'rgba(0, 122, 140, 0.65)');

  const nodeMap = React.useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const getNodeSize = React.useCallback((size?: CircuitNode['size']) => {
    switch (size) {
      case 'sm':
        return 24;
      case 'lg':
        return 48;
      default:
        return 36;
    }
  }, []);

  const calculatePath = React.useCallback(
    (from: CircuitNode, to: CircuitNode): string => {
      const fromSize = getNodeSize(from.size) / 2 + 4;
      const toSize = getNodeSize(to.size) / 2 + 4;
      const dx = to.x - from.x;
      const dy = to.y - from.y;

      let startX = from.x;
      let startY = from.y;
      let endX = to.x;
      let endY = to.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        startX = from.x + (dx > 0 ? fromSize : -fromSize);
        endX = to.x + (dx > 0 ? -toSize : toSize);
        const midX = from.x + dx / 2;
        return `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
      }

      startY = from.y + (dy > 0 ? fromSize : -fromSize);
      endY = to.y + (dy > 0 ? -toSize : toSize);
      const midY = from.y + dy / 2;
      return `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
    },
    [getNodeSize]
  );

  const getStatusColor = (status?: CircuitNode['status']) => {
    switch (status) {
      case 'active':
        return 'rgba(0, 153, 175, 0.95)';
      case 'processing':
        return 'rgba(173, 250, 30, 0.85)';
      case 'error':
        return 'rgba(237, 64, 179, 0.75)';
      default:
        return computedNodeColor;
    }
  };

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ width, height }} {...props}>
      <svg width={width} height={height} className="absolute inset-0" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="circuit-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {showGrid && (
            <pattern id="circuitGrid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
              <circle cx={gridSize / 2} cy={gridSize / 2} r="0.5" fill={computedGridColor} />
            </pattern>
          )}
        </defs>

        {showGrid && <rect width={width} height={height} fill="url(#circuitGrid)" />}

        {connections.map((conn, i) => {
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;

          const path = calculatePath(fromNode, toNode);
          const pathLength = 500;

          return (
            <g key={`connection-${conn.from}-${conn.to}`}>
              <motion.path
                d={path}
                fill="none"
                stroke={conn.color || computedTraceColor}
                strokeWidth={traceWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: i * 0.2 }}
              />
              {conn.animated !== false && (
                <motion.path
                  d={path}
                  fill="none"
                  stroke={conn.pulseColor || computedPulseColor}
                  strokeWidth={traceWidth + 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#circuit-glow)"
                  strokeDasharray={`${pathLength * 0.1} ${pathLength * 0.9}`}
                  initial={{ strokeDashoffset: pathLength }}
                  animate={{ strokeDashoffset: -pathLength }}
                  transition={{
                    duration: pulseSpeed,
                    repeat: Infinity,
                    ease: 'linear',
                    delay: i * 0.3,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((node, i) => {
        const size = getNodeSize(node.size);
        const statusColor = getStatusColor(node.status);

        return (
          <motion.div
            key={node.id}
            className="absolute flex items-center justify-center"
            style={{
              left: node.x - size / 2,
              top: node.y - size / 2,
              width: size,
              height: size,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 + 0.5, type: 'spring' }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: statusColor }}
              animate={node.status === 'processing' ? { opacity: [0.2, 0.5, 0.2] } : { opacity: 0.2 }}
              transition={node.status === 'processing' ? { duration: 1.5, repeat: Infinity } : {}}
            />
            <div className="absolute inset-0 rounded-lg border-2" style={{ borderColor: statusColor }} />
            {node.status === 'active' && (
              <motion.div
                className="absolute inset-0 rounded-lg"
                style={{ boxShadow: `0 0 20px ${statusColor}40, inset 0 0 10px ${statusColor}20` }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
            <div className="relative z-10 flex flex-col items-center justify-center text-brand">
              {node.icon}
            </div>
            {node.label && (
              <div
                className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {node.label}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export { CircuitBoard, type CircuitNode, type CircuitConnection, type CircuitBoardProps };
