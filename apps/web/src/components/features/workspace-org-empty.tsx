'use client';

import { EmptyStateCard } from './empty-state-card';
import { CreateOrganizationAction } from './create-organization-action';

export function WorkspaceOrgEmpty() {
  return (
    <div className="workspace-empty-stack">
      <section className="workspace-empty-hero">
        <div className="workspace-empty-hero__copy">
          <p className="kicker">Рабочее пространство</p>
          <h1>Сначала создайте организацию</h1>
          <p>
            После этого календарь, участники, спектакли и события соберутся в одно
            рабочее пространство и интерфейс перестанет быть пустым.
          </p>
        </div>

        <div className="workspace-empty-hero__aside">
          <div className="workspace-empty-hero__note">
            <strong>Что откроется сразу</strong>
            <span>Календарь, роли, составы, приглашения и настройки команды.</span>
          </div>
          <div className="workspace-empty-hero__chips" aria-hidden="true">
            <span>Календарь</span>
            <span>Составы</span>
            <span>Репетиции</span>
            <span>Доступы</span>
          </div>
        </div>
      </section>

      <EmptyStateCard
        title="Активной организации пока нет"
        description="Создайте первую организацию, чтобы сразу перейти к живому рабочему процессу без тестовых и пустых блоков."
      />

      <div className="workspace-empty-grid" aria-hidden="true">
        <article className="workspace-empty-preview">
          <strong>Тихий старт</strong>
          <p>Сначала контур команды, затем уже расписание, показы и ежедневная работа.</p>
        </article>
        <article className="workspace-empty-preview">
          <strong>Без лишних шагов</strong>
          <p>После создания можно сразу приглашать людей и наполнять календарь без повторной настройки.</p>
        </article>
      </div>

      <div className="workspace-empty-actions">
        <CreateOrganizationAction />
      </div>
    </div>
  );
}
