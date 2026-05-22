package com.school.reservation.support;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestSupport {

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @Autowired
    protected MockMvc mockMvc;

    @BeforeEach
    void resetDatabaseState() {
        jdbcTemplate.update("delete from reservation_histories");
        jdbcTemplate.update("delete from reservations");
        jdbcTemplate.update("delete from reservation_recurrences");
        jdbcTemplate.update("delete from rooms where name not in ('Room 101', 'Seminar Room 201') and system_reserved = false");
        Integer roomCount = jdbcTemplate.queryForObject("select count(*) from rooms", Integer.class);
        if (roomCount != null && roomCount == 0) {
            jdbcTemplate.update("""
                insert into rooms (name, location, capacity, description, enabled)
                values
                ('Room 101', 'Main Building 1F', 40, 'General classroom', true),
                ('Seminar Room 201', 'Main Building 2F', 20, 'Small seminar room', true)
                """);
        }
        jdbcTemplate.update("""
            update rooms
            set enabled = true,
                deleted_at = null,
                system_reserved = false
            where name in ('Room 101', 'Seminar Room 201')
            """);
        jdbcTemplate.update("""
            insert into rooms (name, location, capacity, description, enabled, system_reserved)
            select '(삭제된 강의실)', 'SYSTEM', 0, 'System sentinel room for preserved reservation records.', false, true
            where not exists (
              select 1 from rooms where system_reserved = true and deleted_at is null
            )
            """);
        jdbcTemplate.update("""
            update operation_settings
            set reservation_enabled = true,
                open_time = '09:00',
                close_time = '18:00',
                slot_minutes = 30,
                available_days_of_week = 'MON,TUE,WED,THU,FRI',
                min_reservation_minutes = 30,
                max_reservation_minutes = 240,
                require_phone = true,
                semester_start_date = current_date - interval '1 day',
                semester_end_date = current_date + interval '120 days',
                version = 0
            where id = 1
            """);
    }

    protected UUID firstRoomId() {
        return jdbcTemplate.queryForObject(
            "select id from rooms where name = 'Room 101' and enabled = true and deleted_at is null",
            UUID.class
        );
    }

    protected OffsetDateTime nextWeekdayAt(int hour, int minute) {
        LocalDate date = LocalDate.now();
        while (date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY) {
            date = date.plusDays(1);
        }
        LocalDateTime localDateTime = LocalDateTime.of(date, LocalTime.of(hour, minute));
        return OffsetDateTime.of(localDateTime, ZoneOffset.ofHours(9));
    }

    protected MockHttpSession loginAdminSession() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "admin1234"
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
    }

    protected void createAdminReservation(
        MockHttpSession session,
        UUID roomId,
        String applicantName,
        String applicantEmail,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        String purpose
    ) throws Exception {
        mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "%s",
                      "applicantEmail": "%s",
                      "applicantPhone": "010-9999-9999",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED"
                    }
                    """.formatted(roomId, applicantName, applicantEmail, purpose, startAt, endAt)))
            .andExpect(status().isCreated());
    }
}
