import React, { useEffect, useState, useRef } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  className?: string;
  characters?: string;
  trigger?: any;
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=~<>[]{}';

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 40,
  maxIterations = 10,
  className = '',
  characters = DEFAULT_CHARS,
  trigger
}) => {
  const [displayText, setDisplayText] = useState(text);
  const isScrambling = useRef(false);

  useEffect(() => {
    let iteration = 0;
    let interval: any = null;
    isScrambling.current = true;

    interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '•' || char === '/' || char === '›' || char === '✦') {
              return char;
            }
            if (index < iteration) {
              return text[index];
            }
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );

      if (iteration >= text.length) {
        clearInterval(interval);
        setDisplayText(text);
        isScrambling.current = false;
      }

      iteration += 1 / (maxIterations / 6);
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, maxIterations, characters, trigger]);

  return <span className={className}>{displayText}</span>;
};
