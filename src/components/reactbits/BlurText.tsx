import React from 'react';

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  trigger?: boolean;
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 70,
  className = '',
  animateBy = 'words',
  trigger = true,
}) => {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');

  return (
    <span className={`inline-block ${className}`}>
      {elements.map((el, i) => (
        <span
          key={i}
          className="inline-block transition-all duration-700 ease-out"
          style={{
            filter: trigger ? 'blur(0px)' : 'blur(10px)',
            opacity: trigger ? 1 : 0,
            transform: trigger ? 'translate3d(0,0,0)' : 'translate3d(0, 14px, 0)',
            transitionDelay: `${i * delay}ms`,
            marginRight: animateBy === 'words' ? '0.28em' : '0',
          }}
        >
          {el}
        </span>
      ))}
    </span>
  );
};
