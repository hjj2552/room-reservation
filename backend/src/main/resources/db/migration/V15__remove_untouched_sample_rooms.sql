delete from rooms room
where room.system_reserved = false
  and room.deleted_at is null
  and room.created_by is null
  and room.updated_by is null
  and room.created_at = room.updated_at
  and exists (
    select 1
    from rooms sentinel
    where sentinel.system_reserved = true
      and sentinel.deleted_at is null
      and room.created_at <= sentinel.created_at
  )
  and (
    (
      room.name = 'Room 101'
      and room.location = 'Main Building 1F'
      and room.capacity = 40
      and room.description = 'General classroom'
      and room.enabled = true
    )
    or
    (
      room.name = 'Seminar Room 201'
      and room.location = 'Main Building 2F'
      and room.capacity = 20
      and room.description = 'Small seminar room'
      and room.enabled = true
    )
  )
  and not exists (
    select 1 from reservations reservation where reservation.room_id = room.id
  )
  and not exists (
    select 1 from reservation_recurrences recurrence where recurrence.room_id = room.id
  );
