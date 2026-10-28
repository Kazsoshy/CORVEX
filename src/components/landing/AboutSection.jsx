import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

export function AboutSection() {
  const { about, values } = landingContent;

  return (
    <section className="cvx-about" id="about" aria-labelledby="about-title">
      <div className="cvx-wrap">
        <Reveal as="div" className="cvx-about-top">
          <div>
            <Kicker>{about.kicker}</Kicker>
            <h2 id="about-title">{about.title}</h2>
          </div>
          <p className="cvx-about-intro">{about.intro}</p>
        </Reveal>

        <Reveal as="div" className="cvx-statements" delay={0.08}>
          <article className="cvx-statement" aria-labelledby="about-mission">
            <h3 id="about-mission">{about.mission.label}</h3>
            <p>{about.mission.text}</p>
          </article>
          <article className="cvx-statement" aria-labelledby="about-vision">
            <h3 id="about-vision">{about.vision.label}</h3>
            <p>{about.vision.text}</p>
          </article>
        </Reveal>

        <div className="cvx-value-index">
          <Kicker>Values</Kicker>
          <ul>
            {values.map((value, index) => (
              <li key={value.id}>
                <a href={`#${value.id}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {value.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
