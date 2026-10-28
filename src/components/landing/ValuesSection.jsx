import { landingContent } from '../../content/landingContent';
import { Kicker } from './Kicker';
import { Reveal } from './Reveal';

export function ValuesSection() {
  const { valuesIntro, values } = landingContent;
  const [lead, ...rest] = values;

  return (
    <section className="cvx-values" id="values" aria-labelledby="values-title">
      <div className="cvx-wrap">
        <Reveal as="div" className="cvx-section-head is-inverse">
          <div>
            <Kicker>{valuesIntro.kicker}</Kicker>
            <h2 id="values-title">{valuesIntro.title}</h2>
          </div>
          <p className="cvx-section-lead">{valuesIntro.lede}</p>
        </Reveal>

        <div className="cvx-values-layout">
          <article className="cvx-value-lead" id={lead.id} aria-labelledby={`${lead.id}-title`}>
            <p className="cvx-index-no">01</p>
            <h3 id={`${lead.id}-title`}>{lead.name}</h3>
            <p>{lead.text}</p>
          </article>
          <div className="cvx-value-side">
            {rest.map((value, index) => (
              <article key={value.id} id={value.id} aria-labelledby={`${value.id}-title`}>
                <p className="cvx-index-no">{String(index + 2).padStart(2, '0')}</p>
                <h3 id={`${value.id}-title`}>{value.name}</h3>
                <p>{value.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
