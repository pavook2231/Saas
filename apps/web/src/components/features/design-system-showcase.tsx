'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';

const participantOptions = [
  { value: 'lead-1', label: 'Анна Каренина', description: 'Участник с аккаунтом', badge: 'User' },
  { value: 'lead-2', label: 'Михаил Светлов', description: 'Участник без аккаунта', badge: 'Participant' },
  { value: 'lead-3', label: 'Мария Орлова', description: 'Артист балета', badge: 'User' },
  { value: 'lead-4', label: 'Павел Ершов', description: 'Приглашенный актер', badge: 'Participant' },
];

export function DesignSystemShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([
    participantOptions[0].value,
    participantOptions[2].value,
  ]);

  return (
    <>
      <Card className="showcase-card">
        <CardHeader>
          <CardTitle>Дизайн-система</CardTitle>
          <CardDescription>
            Базовые компоненты уже собраны в один язык интерфейса: меньше шума, быстрее решения, чище форма.
          </CardDescription>
        </CardHeader>

        <CardContent className="showcase-grid">
          <div className="showcase-block">
            <span className="showcase-label">Кнопки</span>
            <div className="showcase-inline">
              <Button>Primary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </div>

          <div className="showcase-block">
            <span className="showcase-label">Статусы</span>
            <div className="showcase-inline">
              <Badge variant="primary">Активно</Badge>
              <Badge variant="success">Синхронизировано</Badge>
              <Badge variant="warning">Нужна проверка</Badge>
              <Badge variant="error">Ошибка</Badge>
            </div>
          </div>

          <div className="showcase-block">
            <span className="showcase-label">Поля формы</span>
            <div className="showcase-stack">
              <Input label="Название спектакля" placeholder="Король Лир" />
              <Select label="Тип события" defaultValue="rehearsal">
                <option value="rehearsal">Репетиция</option>
                <option value="performance">Спектакль</option>
                <option value="meeting">Встреча</option>
              </Select>
            </div>
          </div>

          <div className="showcase-block">
            <span className="showcase-label">MultiSelect и подсказки</span>
            <div className="showcase-stack">
              <MultiSelect
                label="Состав"
                options={participantOptions}
                value={selectedParticipants}
                onChange={setSelectedParticipants}
                placeholder="Выберите участников"
                searchPlaceholder="Найти участника"
                emptyText="Совпадений нет"
              />
              <Tooltip content="Подсказка появляется мягко и не конкурирует за внимание с основной формой.">
                <span className="showcase-tooltip-anchor">Показать пример tooltip</span>
              </Tooltip>
            </div>
          </div>
        </CardContent>

        <div className="showcase-actions">
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            Открыть modal
          </Button>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Пример модального окна"
        description="Окно использует тот же ритм отступов, типографику и систему действий, что и остальной интерфейс."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => setModalOpen(false)}>Готово</Button>
          </>
        }
      >
        <div className="showcase-modal-body">
          <Input label="Название" defaultValue="Новая репетиция" />
          <Select label="Приоритет" defaultValue="high">
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </Select>
        </div>
      </Modal>
    </>
  );
}
