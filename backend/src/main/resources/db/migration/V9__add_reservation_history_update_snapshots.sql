alter table reservation_histories
  add column before_reservation_room_id uuid,
  add column before_reservation_room_name varchar(100),
  add column before_reservation_purpose varchar(500),
  add column before_reservation_start_at timestamptz,
  add column before_reservation_end_at timestamptz,
  add column before_reservation_applicant_name varchar(100),
  add column before_reservation_applicant_email varchar(255),
  add column before_reservation_applicant_phone varchar(50),
  add column reservation_applicant_name varchar(100),
  add column reservation_applicant_email varchar(255),
  add column reservation_applicant_phone varchar(50);
