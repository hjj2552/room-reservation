update operation_settings
set organization_name = 'Room Reservation',
    public_notice = 'Please enter purpose and time accurately before reserving.',
    reservation_disabled_message = 'Reservation is currently disabled.',
    admin_contact_name = 'Admin',
    admin_contact_email = 'admin@example.edu',
    completion_message = 'Reservation request has been submitted.'
where id = 1;

insert into rooms (name, location, capacity, description, enabled)
select 'Room 101', 'Main Building 1F', 40, 'General classroom', true
where not exists (
  select 1 from rooms where name = 'Room 101'
);

insert into rooms (name, location, capacity, description, enabled)
select 'Seminar Room 201', 'Main Building 2F', 20, 'Small seminar room', true
where not exists (
  select 1 from rooms where name = 'Seminar Room 201'
);

