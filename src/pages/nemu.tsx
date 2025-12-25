import { useEffect, useRef, useState } from "react";

export default function NemuPage() {
  const [loaded, setLoaded] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Quicksand:wght@400;500;600&display=swap');

        .nemu-page {
          --indigo-deep: #1a1b3a;
          --indigo-mid: #2d2f5e;
          --purple-soft: #6b5b95;
          --blue-bright: #5b8dee;
          --blue-soft: #8ec5fc;
          --pink-soft: #e8b4cb;
          --pink-bright: #f5a3c7;
          --gold-warm: #f0d78c;
          --gold-bright: #ffd93d;
          --cream: #fef9f3;
          --silver: #c8d0e7;

          min-height: 100vh;
          background: linear-gradient(
            135deg,
            var(--indigo-deep) 0%,
            var(--indigo-mid) 40%,
            var(--purple-soft) 100%
          );
          font-family: 'Quicksand', sans-serif;
          overflow-x: hidden;
          position: relative;
        }

        .nemu-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 20% 40%, rgba(91, 141, 238, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 60%, rgba(245, 163, 199, 0.12) 0%, transparent 50%);
          pointer-events: none;
        }

        /* Floating particles */
        .particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .particle {
          position: absolute;
          width: 4px;
          height: 4px;
          background: var(--gold-warm);
          border-radius: 50%;
          opacity: 0;
          animation: float-particle 8s infinite ease-in-out;
        }

        .particle:nth-child(odd) {
          background: var(--blue-soft);
          animation-duration: 10s;
        }

        .particle:nth-child(3n) {
          background: var(--pink-soft);
          animation-duration: 12s;
        }

        @keyframes float-particle {
          0%, 100% {
            opacity: 0;
            transform: translateY(100vh) scale(0);
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.6;
          }
          100% {
            opacity: 0;
            transform: translateY(-20vh) scale(1.2);
          }
        }

        /* Main content container */
        .nemu-container {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 3rem 2rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          min-height: 100vh;
          align-items: center;
        }

        @media (max-width: 900px) {
          .nemu-container {
            grid-template-columns: 1fr;
            text-align: center;
            padding: 2rem 1.5rem;
            gap: 2rem;
          }
        }

        /* Text content */
        .nemu-content {
          opacity: 0;
          transform: translateX(-40px);
          transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nemu-content.loaded {
          opacity: 1;
          transform: translateX(0);
        }

        .nemu-greeting {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(0.9rem, 2vw, 1.1rem);
          color: var(--gold-warm);
          letter-spacing: 0.3em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          opacity: 0;
          animation: fade-slide-up 0.8s 0.3s forwards;
        }

        .nemu-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(3.5rem, 8vw, 6rem);
          font-weight: 600;
          color: var(--cream);
          line-height: 1;
          margin-bottom: 0.5rem;
          text-shadow:
            0 0 40px rgba(142, 197, 252, 0.3),
            0 0 80px rgba(91, 141, 238, 0.2);
          opacity: 0;
          animation: fade-slide-up 0.8s 0.5s forwards;
        }

        .nemu-title-jp {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.2rem, 3vw, 1.8rem);
          color: var(--silver);
          font-style: italic;
          margin-bottom: 2rem;
          opacity: 0;
          animation: fade-slide-up 0.8s 0.7s forwards;
        }

        .nemu-description {
          font-size: clamp(1rem, 2vw, 1.15rem);
          color: var(--silver);
          line-height: 1.8;
          max-width: 480px;
          opacity: 0;
          animation: fade-slide-up 0.8s 0.9s forwards;
        }

        @media (max-width: 900px) {
          .nemu-description {
            margin: 0 auto;
          }
        }

        .nemu-description strong {
          color: var(--pink-soft);
          font-weight: 600;
        }

        .nemu-traits {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 2rem;
          opacity: 0;
          animation: fade-slide-up 0.8s 1.1s forwards;
        }

        @media (max-width: 900px) {
          .nemu-traits {
            justify-content: center;
          }
        }

        .trait {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 100px;
          font-size: 0.85rem;
          color: var(--cream);
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .trait:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--gold-warm);
          transform: translateY(-2px);
        }

        .trait-icon {
          font-size: 1rem;
        }

        @keyframes fade-slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Portrait section */
        .nemu-portrait-section {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          opacity: 0;
          transform: translateX(40px) scale(0.95);
          transition: all 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .nemu-portrait-section.loaded {
          opacity: 1;
          transform: translateX(0) scale(1);
        }

        /* Magical circle behind portrait */
        .magic-circle {
          position: absolute;
          width: 120%;
          height: 120%;
          border: 1px solid rgba(142, 197, 252, 0.2);
          border-radius: 50%;
          animation: spin-slow 30s linear infinite;
        }

        .magic-circle::before,
        .magic-circle::after {
          content: '';
          position: absolute;
          inset: 10%;
          border: 1px solid rgba(245, 163, 199, 0.15);
          border-radius: 50%;
        }

        .magic-circle::after {
          inset: 20%;
          border-color: rgba(240, 215, 140, 0.1);
          animation: spin-reverse 20s linear infinite;
        }

        @keyframes spin-slow {
          to { transform: rotate(360deg); }
        }

        @keyframes spin-reverse {
          to { transform: rotate(-360deg); }
        }

        /* Portrait frame */
        .portrait-frame {
          position: relative;
          width: min(400px, 80vw);
          aspect-ratio: 1;
          border-radius: 20px;
          overflow: visible;
          z-index: 2;
        }

        .portrait-glow {
          position: absolute;
          inset: -20px;
          background: radial-gradient(
            circle at center,
            rgba(91, 141, 238, 0.4) 0%,
            rgba(107, 91, 149, 0.2) 40%,
            transparent 70%
          );
          filter: blur(30px);
          z-index: -1;
          animation: pulse-glow 4s ease-in-out infinite alternate;
        }

        @keyframes pulse-glow {
          from { opacity: 0.6; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1.05); }
        }

        .portrait-inner {
          width: 100%;
          height: 100%;
          border-radius: 20px;
          background: linear-gradient(
            145deg,
            rgba(91, 141, 238, 0.2),
            rgba(107, 91, 149, 0.2)
          );
          padding: 3px;
          position: relative;
          overflow: hidden;
        }

        .portrait-inner::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 2px;
          background: linear-gradient(
            135deg,
            var(--gold-warm),
            var(--pink-soft),
            var(--blue-soft),
            var(--gold-warm)
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.6;
        }

        .portrait-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 18px;
          transition: transform 0.4s ease;
        }

        .portrait-frame:hover .portrait-img {
          transform: scale(1.03);
        }

        /* Floating books decoration */
        .floating-book {
          position: absolute;
          width: 50px;
          height: 60px;
          opacity: 0;
          z-index: 10;
        }

        .floating-book.loaded {
          animation: book-float 6s ease-in-out infinite;
        }

        .floating-book:nth-child(1) {
          top: -10%;
          left: -5%;
          animation-delay: 0s;
        }

        .floating-book:nth-child(2) {
          bottom: 5%;
          right: -10%;
          animation-delay: -2s;
        }

        .floating-book:nth-child(3) {
          top: 30%;
          right: -15%;
          animation-delay: -4s;
          transform: scale(0.8);
        }

        @keyframes book-float {
          0%, 100% {
            opacity: 0.8;
            transform: translateY(0) rotate(-5deg);
          }
          50% {
            opacity: 1;
            transform: translateY(-15px) rotate(5deg);
          }
        }

        .book-body {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, var(--indigo-mid), var(--purple-soft));
          border-radius: 3px 8px 8px 3px;
          box-shadow:
            -3px 0 0 var(--gold-warm),
            0 4px 15px rgba(0, 0, 0, 0.3);
          position: relative;
        }

        .book-body::before {
          content: '';
          position: absolute;
          top: 10%;
          left: 10%;
          right: 15%;
          bottom: 10%;
          border: 1px solid var(--gold-warm);
          opacity: 0.5;
        }

        .book-wing {
          position: absolute;
          top: -15px;
          width: 25px;
          height: 20px;
          background: linear-gradient(to top, var(--cream), var(--blue-soft));
          clip-path: polygon(50% 100%, 0 0, 100% 0);
          opacity: 0.9;
          animation: wing-flap 0.4s ease-in-out infinite alternate;
        }

        .book-wing.left {
          left: 5px;
          transform: rotate(-20deg);
        }

        .book-wing.right {
          right: 5px;
          transform: rotate(20deg);
          animation-delay: -0.2s;
        }

        @keyframes wing-flap {
          from { transform: rotate(-25deg) scaleY(1); }
          to { transform: rotate(-15deg) scaleY(0.9); }
        }

        .book-wing.right {
          animation-name: wing-flap-right;
        }

        @keyframes wing-flap-right {
          from { transform: rotate(25deg) scaleY(1); }
          to { transform: rotate(15deg) scaleY(0.9); }
        }

        /* Quote section */
        .nemu-quote {
          position: relative;
          margin-top: 3rem;
          padding: 1.5rem 2rem;
          background: rgba(255, 255, 255, 0.03);
          border-left: 3px solid var(--gold-warm);
          border-radius: 0 12px 12px 0;
          opacity: 0;
          animation: fade-slide-up 0.8s 1.3s forwards;
        }

        .quote-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(1.1rem, 2.5vw, 1.4rem);
          font-style: italic;
          color: var(--cream);
          line-height: 1.6;
        }

        .quote-attribution {
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--pink-soft);
        }

        /* Bottom decorative wave */
        .wave-decoration {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 150px;
          pointer-events: none;
          overflow: hidden;
        }

        .wave {
          position: absolute;
          bottom: -50px;
          left: -10%;
          width: 120%;
          height: 200px;
          background: linear-gradient(
            to top,
            rgba(91, 141, 238, 0.1),
            transparent
          );
          border-radius: 50% 50% 0 0;
          animation: wave-motion 8s ease-in-out infinite;
        }

        .wave:nth-child(2) {
          animation-delay: -2s;
          opacity: 0.5;
          background: linear-gradient(
            to top,
            rgba(245, 163, 199, 0.08),
            transparent
          );
        }

        @keyframes wave-motion {
          0%, 100% {
            transform: translateX(-5%) scaleY(1);
          }
          50% {
            transform: translateX(5%) scaleY(1.1);
          }
        }

        /* Icon in corner */
        .corner-icon {
          position: fixed;
          top: 2rem;
          right: 2rem;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          overflow: hidden;
          border: 2px solid rgba(240, 215, 140, 0.5);
          box-shadow:
            0 0 20px rgba(91, 141, 238, 0.3),
            0 4px 15px rgba(0, 0, 0, 0.2);
          opacity: 0;
          transform: scale(0.8) rotate(-10deg);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.5s;
          z-index: 100;
        }

        .corner-icon.loaded {
          opacity: 1;
          transform: scale(1) rotate(0);
        }

        .corner-icon:hover {
          transform: scale(1.1) rotate(5deg);
          border-color: var(--gold-warm);
        }

        .corner-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Sparkle decoration */
        .sparkle {
          position: absolute;
          width: 20px;
          height: 20px;
          pointer-events: none;
        }

        .sparkle::before,
        .sparkle::after {
          content: '';
          position: absolute;
          background: var(--gold-warm);
        }

        .sparkle::before {
          width: 100%;
          height: 2px;
          top: 50%;
          transform: translateY(-50%);
        }

        .sparkle::after {
          width: 2px;
          height: 100%;
          left: 50%;
          transform: translateX(-50%);
        }
      `}</style>

      <div
        className="nemu-page"
        ref={containerRef}
        onMouseMove={handleMouseMove}
      >
        {/* Floating particles */}
        <div className="particles">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 8}s`,
                width: `${3 + Math.random() * 4}px`,
                height: `${3 + Math.random() * 4}px`,
              }}
            />
          ))}
        </div>

        {/* Corner icon */}
        <div className={`corner-icon ${loaded ? 'loaded' : ''}`}>
          <img src="/icon.jpg" alt="Nemu icon" />
        </div>

        {/* Main content */}
        <div className="nemu-container">
          <div className={`nemu-content ${loaded ? 'loaded' : ''}`}>
            <p className="nemu-greeting">Meet Our Mascot</p>
            <h1 className="nemu-title">Nemu</h1>
            <p className="nemu-title-jp">眠 — The Dreaming Librarian</p>

            <p className="nemu-description">
              A whimsical guardian of stories, <strong>Nemu</strong> watches over
              an infinite library of manga and tales. With her enchanted books
              that flutter on delicate wings, she guides readers through
              boundless worlds of imagination.
            </p>

            <div className="nemu-traits">
              <span className="trait">
                <span className="trait-icon">📚</span>
                Book Keeper
              </span>
              <span className="trait">
                <span className="trait-icon">✨</span>
                Dream Weaver
              </span>
              <span className="trait">
                <span className="trait-icon">🌙</span>
                Night Reader
              </span>
              <span className="trait">
                <span className="trait-icon">💫</span>
                Story Guide
              </span>
            </div>

            <div className="nemu-quote">
              <p className="quote-text">
                "Every page holds a doorway, every story a world waiting to be explored.
                Let me show you the way..."
              </p>
              <p className="quote-attribution">— Nemu</p>
            </div>
          </div>

          <div className={`nemu-portrait-section ${loaded ? 'loaded' : ''}`}>
            <div className="magic-circle" />

            {/* Floating books */}
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`floating-book ${loaded ? 'loaded' : ''}`}>
                <div className="book-body">
                  <div className="book-wing left" />
                  <div className="book-wing right" />
                </div>
              </div>
            ))}

            <div
              className="portrait-frame"
              style={{
                transform: `perspective(1000px) rotateY(${(mousePos.x - 0.5) * 5}deg) rotateX(${(mousePos.y - 0.5) * -5}deg)`,
              }}
            >
              <div className="portrait-glow" />
              <div className="portrait-inner">
                <img
                  src="/portrait.png"
                  alt="Nemu - The Dreaming Librarian"
                  className="portrait-img"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom wave decoration */}
        <div className="wave-decoration">
          <div className="wave" />
          <div className="wave" />
        </div>
      </div>
    </>
  );
}
