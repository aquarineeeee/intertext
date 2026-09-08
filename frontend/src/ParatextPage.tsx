import { palette as C } from './theme'
import type { CSSProperties } from 'react'
import './ParatextPage.css'

interface ParatextPageProps {
  onNavigate: (path: string) => void
}

const chapters = [
  ['01.', 'The Real Destination', 'p. 07'],
  ['02.', 'The Art of Going Nowhere', 'p. 21'],
  ['03.', 'Stillness in the World', 'Current | p. 45'],
  ['04.', 'The Pause That Refreshes', 'p. 62'],
  ['05.', 'Living in the Present', 'p. 79'],
  ['06.', 'Beyond the Mind', 'p. 94'],
]

const ledger = [
  {
    month: 'August 2026',
    entries: [
      { kind: 'annotation', quote: '"Sitting still is not about turning your back on the world; it is about stepping back so you can see it clearer."', note: '退后一步并非遁世，而是为了摆脱信息流与即时反馈带来的近视感。', date: '08-28' },
      { kind: 'excerpt', quote: '"The world is not changed by your being anxious about it." | p. 34', date: '08-27' },
      { kind: 'note', quote: '断网慢读的心得：在极度嘈杂的环境中，物理空间的退缩并不能解决内心的焦虑。真正的静止是一种主动的专注状态。', date: '08-25' },
      { kind: 'annotation', quote: '"In an age of speed, nothing could be more invigorating than going slow."', note: '速度已经变成一种工业惯性，而慢成了极度罕见的奢侈品。', date: '08-19' },
      { kind: 'excerpt', quote: '"Heaven is not a place, it is a direction." | p. 28', date: '08-11' },
    ],
  },
  {
    month: 'July 2026',
    entries: [
      { kind: 'annotation', quote: '"Leonard Cohen lived for years on Mount Baldy, washing dishes and sitting in silence."', note: '激情的创作期与长久的隐修并不冲突，后者正是前者的滋养来源。', date: '07-29' },
      { kind: 'note', quote: '初读引言：决定将这本书作为每日晨间无屏幕阅读的载体，每次只读三至五页，并在空白页边以铅笔手抄核心意象。', date: '07-24' },
    ],
  },
]

export default function ParatextPage({ onNavigate }: ParatextPageProps) {
  const style = {
    '--paratext-bg': C.bg,
    '--paratext-surface': C.card,
    '--paratext-surface-muted': C.cardDeep,
    '--paratext-ink': C.fg,
    '--paratext-muted': C.muted,
    '--paratext-rule': C.border,
    '--paratext-rule-strong': C.borderMid,
    '--paratext-accent': C.accent,
    '--paratext-cover': C.bookCovers[1],
  } as CSSProperties

  return (
    <main className="paratext-page" style={style}>
      <nav className="paratext-nav" aria-label="Page navigation">
        <button type="button" className="paratext-back" onClick={() => onNavigate('/library')}>
          <span aria-hidden="true">&larr;</span>
          Library
        </button>
      </nav>

      <div className="paratext-layout">
        <section className="paratext-archive" aria-labelledby="paratext-book-title">
          <div className="paratext-book-intro">
            <div className="paratext-cover" aria-label="The Art of Stillness book cover">
              <div className="paratext-cover-spine" />
              <div className="paratext-cover-copy">
                <strong>The Art of<br />Stillness</strong>
                <span>Pico Iyer</span>
              </div>
            </div>

            <div className="paratext-book-meta">
              <div>
                <h1 id="paratext-book-title">The Art of Stillness</h1>
                <p className="paratext-subtitle">Adventures in Going Nowhere</p>
                <p className="paratext-author">Pico Iyer</p>
              </div>
              <div className="paratext-progress-block">
                <div className="paratext-progress-label"><span>Reading progress</span><strong>42% (Ch. 3)</strong></div>
                <div className="paratext-progress-track"><span /></div>
                <button type="button" className="paratext-continue" onClick={() => onNavigate('/read')}>
                  Continue reading <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>
          </div>

          <div className="paratext-synopsis">
            <h2>Synopsis</h2>
            <p>In an age of speed, nothing could be more invigorating than going slow. In an age of distraction, nothing could be more luxurious than paying attention. And in an age of constant movement, nothing is more urgent than sitting still.</p>
            <p>Pico Iyer investigates the lives of people who have made a life out of finding stillness, from Marcel Proust to Emily Dickinson and from Leonard Cohen to ordinary people seeking an inward sanctuary.</p>
          </div>

          <section className="paratext-contents" aria-labelledby="contents-title">
            <div className="paratext-section-heading">
              <h2 id="contents-title">Contents</h2>
              <span>6 chapters</span>
            </div>
            <div className="paratext-chapter-list">
              {chapters.map(([number, title, page], index) => (
                <button type="button" className={`paratext-chapter${index === 2 ? ' is-current' : ''}`} key={number} onClick={() => index === 2 && onNavigate('/read')}>
                  <span className="paratext-chapter-number">{number}</span>
                  <span className="paratext-chapter-title">{title}</span>
                  <span className="paratext-chapter-page">{page}</span>
                </button>
              ))}
            </div>
          </section>
        </section>

        <section className="paratext-ledger" aria-labelledby="ledger-title">
          <header className="paratext-ledger-header"><h2 id="ledger-title">Reading Ledger</h2></header>
          <div className="paratext-ledger-scroll">
            {ledger.map(group => (
              <section className="paratext-ledger-group" key={group.month} aria-label={group.month}>
                <div className="paratext-month"><span>{group.month}</span><i /></div>
                <div className="paratext-entries">
                  {group.entries.map(entry => (
                    <article className={`paratext-entry paratext-entry-${entry.kind}`} key={`${group.month}-${entry.date}`}>
                      <div className="paratext-entry-main">
                        <p>{entry.quote}</p>
                        <time>{entry.date}</time>
                      </div>
                      {entry.note && <p className="paratext-entry-note">{entry.note}</p>}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
