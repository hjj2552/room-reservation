import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { errorMessage } from '../../shared/api/http';
import type { RoomOrderItem } from '../../shared/api/types';
import { SidePanel } from '../../shared/components/SidePanel';
import { ErrorState, LoadingState } from '../../shared/components/StateViews';
import { useRoomOrder, useSaveRoomOrder } from '../../shared/hooks/useRooms';

const verticalDragModifiers = [restrictToVerticalAxis];

interface RoomOrderPanelProps {
  onClose: () => void;
}

export function RoomOrderPanel({ onClose }: RoomOrderPanelProps) {
  const roomOrder = useRoomOrder({ refetchOnMount: 'always' });
  const saveRoomOrder = useSaveRoomOrder();
  const [items, setItems] = useState<RoomOrderItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [keyboardStatus, setKeyboardStatus] = useState('');
  const initializedRef = useRef(false);
  const dragStartItemsRef = useRef<RoomOrderItem[]>([]);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
  );

  const hasFreshOrder = roomOrder.isFetchedAfterMount
    && roomOrder.isSuccess
    && !roomOrder.isFetching;

  useEffect(() => {
    if (!roomOrder.data || !hasFreshOrder || initializedRef.current) return;
    setItems(roomOrder.data.items);
    initializedRef.current = true;
  }, [hasFreshOrder, roomOrder.data]);

  const isInitializing = !hasFreshOrder && roomOrder.isFetching;

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) || null,
    [activeId, items],
  );

  function itemAnnouncement(id: string | number) {
    const index = items.findIndex((item) => item.id === id);
    const item = items[index];
    if (!item || index < 0) return '공간';
    return `${item.name}, ${items.length}개 중 ${index + 1}번째`;
  }

  function handleDragStart(event: DragStartEvent) {
    dragStartItemsRef.current = items;
    setActiveId(String(event.active.id));
  }

  function handleKeyboardLift(id: string) {
    dragStartItemsRef.current = items;
    setActiveId(id);
    setKeyboardStatus(`${itemAnnouncement(id)} 항목을 들었습니다.`);
  }

  function moveItemByKeyboard(id: string, direction: -1 | 1) {
    const from = items.findIndex((item) => item.id === id);
    const to = Math.max(0, Math.min(items.length - 1, from + direction));
    if (from < 0 || from === to) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    setKeyboardStatus(`${next[to].name}, ${next.length}개 중 ${to + 1}번째`);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    setItems((current) => {
      const from = current.findIndex((item) => item.id === event.active.id);
      const to = current.findIndex((item) => item.id === event.over?.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  function handleDragEnd(_event: DragEndEvent) {
    setActiveId(null);
  }

  function handleKeyboardDrop() {
    if (activeId) {
      setKeyboardStatus(`${itemAnnouncement(activeId)} 위치에 놓았습니다.`);
    }
    setActiveId(null);
  }

  function handleDragCancel(_event?: DragCancelEvent) {
    setItems(dragStartItemsRef.current);
    setActiveId(null);
    setKeyboardStatus('순서 변경을 취소했습니다.');
  }

  function handleSave() {
    if (!hasFreshOrder || !roomOrder.data || saveRoomOrder.isPending) return;
    saveRoomOrder.mutate(
      {
        orderVersion: roomOrder.data.orderVersion,
        roomIds: items.map((item) => item.id),
      },
      {
        onSuccess: onClose,
      },
    );
  }

  return (
    <SidePanel
      title="순서 변경"
      titleId="room-order-title"
      className="room-order-panel"
      onClose={onClose}
      testId="room-order-panel"
      closeTestId="room-order-close"
      closeButtonLabel="순서 변경 패널 닫기"
    >
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {keyboardStatus}
      </div>
      {roomOrder.isLoading || isInitializing ? <LoadingState /> : null}
      {roomOrder.isError ? <ErrorState error={roomOrder.error} /> : null}
      {roomOrder.data && hasFreshOrder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={verticalDragModifiers}
          autoScroll
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'Space 키로 항목을 들고 방향키로 이동한 뒤 Space 또는 Enter 키로 놓습니다. Escape 키로 이동을 취소합니다.',
            },
            announcements: {
              onDragStart: ({ active }) => `${itemAnnouncement(active.id)} 항목을 들었습니다.`,
              onDragOver: ({ over }) => over ? `${itemAnnouncement(over.id)} 위치로 이동했습니다.` : undefined,
              onDragEnd: ({ active, over }) => over
                ? `${itemAnnouncement(active.id)} 항목을 ${itemAnnouncement(over.id)} 위치에 놓았습니다.`
                : '항목 이동을 마쳤습니다.',
              onDragCancel: ({ active }) => `${itemAnnouncement(active.id)} 항목 이동을 취소했습니다.`,
            },
          }}
        >
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <ol className="room-order-list" data-testid="room-order-list">
              {items.map((item) => (
                <SortableRoomOrderItem
                  key={item.id}
                  item={item}
                  isActive={activeId === item.id}
                  onKeyboardLift={handleKeyboardLift}
                  onKeyboardMove={moveItemByKeyboard}
                  onKeyboardDrop={handleKeyboardDrop}
                  onKeyboardCancel={handleDragCancel}
                />
              ))}
            </ol>
          </SortableContext>
          <DragOverlay modifiers={verticalDragModifiers}>
            {activeItem ? (
              <RoomOrderItemContent
                item={activeItem}
                overlay
                handle={(
                  <span
                    className="room-order-handle room-order-overlay-handle"
                    aria-hidden="true"
                    data-testid="room-order-overlay-handle"
                  >
                    ⠿
                  </span>
                )}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      {saveRoomOrder.error ? (
        <div className="inline-error" role="alert" data-testid="room-order-error">
          {errorMessage(saveRoomOrder.error)}
        </div>
      ) : null}

      <div className="side-panel-actions room-order-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={saveRoomOrder.isPending}
          data-testid="room-order-cancel"
        >
          취소
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={handleSave}
          disabled={!hasFreshOrder || !roomOrder.data || saveRoomOrder.isPending}
          data-testid="room-order-save"
        >
          {saveRoomOrder.isPending ? '저장 중...' : '저장'}
        </button>
      </div>
    </SidePanel>
  );
}

function SortableRoomOrderItem({
  item,
  isActive,
  onKeyboardLift,
  onKeyboardMove,
  onKeyboardDrop,
  onKeyboardCancel,
}: {
  item: RoomOrderItem;
  isActive: boolean;
  onKeyboardLift: (id: string) => void;
  onKeyboardMove: (id: string, direction: -1 | 1) => void;
  onKeyboardDrop: () => void;
  onKeyboardCancel: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!isActive && event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      onKeyboardLift(item.id);
      return;
    }
    if (!isActive) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      onKeyboardMove(item.id, event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onKeyboardDrop();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onKeyboardCancel();
    }
  }

  return (
    <li
      ref={setNodeRef}
      className={`room-order-item${isActive ? ' is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      data-room-id={item.id}
      data-testid="room-order-item"
    >
      <RoomOrderItemContent
        item={item}
        handle={(
          <button
            type="button"
            className="room-order-handle"
            aria-label={`${item.name} 순서 변경`}
            {...attributes}
            {...listeners}
            aria-pressed={isActive}
            onKeyDown={handleKeyDown}
            data-testid="room-order-handle"
          >
            <span aria-hidden="true">⠿</span>
          </button>
        )}
      />
    </li>
  );
}

function RoomOrderItemContent({
  item,
  handle,
  overlay = false,
}: {
  item: RoomOrderItem;
  handle?: ReactNode;
  overlay?: boolean;
}) {
  return (
    <div className={`room-order-item-content${overlay ? ' is-overlay' : ''}`}>
      {handle}
      <span className="room-order-name">{item.name}</span>
      {!item.enabled ? <span className="room-order-status">사용 안 함</span> : null}
    </div>
  );
}
