package com.school.reservation.domain.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class AdminRoomIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanCreateUpdateToggleAndHardDeleteRoom() throws Exception {
        MockHttpSession session = loginAsAdmin();
        UUID roomId = createRoom(session, "testing-room-admin-a");

        mockMvc.perform(put("/api/admin/rooms/{roomId}", roomId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "testing-room-admin-a-updated",
                      "location": "Annex 1F",
                      "capacity": 24,
                      "description": "Updated room",
                      "enabled": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("testing-room-admin-a-updated"))
            .andExpect(jsonPath("$.capacity").value(24));

        mockMvc.perform(patch("/api/admin/rooms/{roomId}/enabled", roomId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "enabled": false
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));

        mockMvc.perform(get("/api/admin/rooms/{roomId}/deletion-check", roomId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletable").value(true))
            .andExpect(jsonPath("$.blockers.length()").value(0));

        mockMvc.perform(delete("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/public/rooms"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].id").value(not(hasItem(roomId.toString()))));

        mockMvc.perform(get("/api/public/rooms/{roomId}", roomId))
            .andExpect(status().isNotFound());

        createRoom(session, "testing-room-admin-a-updated");
    }

    @Test
    void referencedRoomDeletionPreservesReservationAndMovesReferenceToSentinel() throws Exception {
        MockHttpSession session = loginAsAdmin();
        String roomName = "testing-room-deleted-with-reservation";
        UUID roomId = createRoom(session, roomName);
        createAdminReservation(
            session,
            roomId,
            "Deletion Blocker",
            "delete-blocker@example.com",
            nextWeekdayAt(10, 0).plusDays(7),
            nextWeekdayAt(11, 0).plusDays(7),
            "Deletion blocker"
        );

        mockMvc.perform(get("/api/admin/rooms/{roomId}/deletion-check", roomId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletable").value(true))
            .andExpect(jsonPath("$.checks[*].code").value(hasItem("RESERVATION_REFERENCES_REASSIGNED")));

        mockMvc.perform(delete("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isNoContent());

        UUID sentinelRoomId = sentinelRoomId();
        UUID reservationRoomId = jdbcTemplate.queryForObject(
            "select room_id from reservations where applicant_email = 'delete-blocker@example.com'",
            UUID.class
        );
        String originalRoomName = jdbcTemplate.queryForObject(
            "select original_room_name from reservations where applicant_email = 'delete-blocker@example.com'",
            String.class
        );
        assertThat(reservationRoomId).isEqualTo(sentinelRoomId);
        assertThat(originalRoomName).isEqualTo(roomName);

        mockMvc.perform(get("/api/admin/reservations")
                .session(session)
                .param("roomId", sentinelRoomId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].roomName").value(roomName + " (삭제됨)"));
    }

    @Test
    void referencedRoomDeletionPreservesRecurrenceAndMovesReferenceToSentinel() throws Exception {
        MockHttpSession session = loginAsAdmin();
        String roomName = "testing-room-deleted-with-recurrence";
        UUID roomId = createRoom(session, roomName);
        jdbcTemplate.update("""
            insert into reservation_recurrences (
              room_id,
              applicant_name,
              applicant_email,
              applicant_phone,
              purpose,
              start_date,
              end_date,
              days_of_week,
              start_time,
              end_time,
              conflict_policy
            )
            values (
              ?,
              'Recurring User',
              'recurring-delete-blocker@example.com',
              '010-0000-0000',
              'Recurring blocker',
              current_date,
              current_date + interval '14 days',
              'MON',
              '10:00',
              '11:00',
              'SKIP_CONFLICTS'::recurrence_conflict_policy
            )
            """, roomId);

        mockMvc.perform(delete("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isNoContent());

        UUID sentinelRoomId = sentinelRoomId();
        UUID recurrenceRoomId = jdbcTemplate.queryForObject(
            "select room_id from reservation_recurrences where applicant_email = 'recurring-delete-blocker@example.com'",
            UUID.class
        );
        String originalRoomName = jdbcTemplate.queryForObject(
            "select original_room_name from reservation_recurrences where applicant_email = 'recurring-delete-blocker@example.com'",
            String.class
        );
        assertThat(recurrenceRoomId).isEqualTo(sentinelRoomId);
        assertThat(originalRoomName).isEqualTo(roomName);

        mockMvc.perform(get("/api/admin/recurrences")
                .session(session)
                .param("includeDeleted", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].roomName").value(roomName + " (삭제됨)"));
    }

    @Test
    void sentinelRoomIsHiddenAndProtected() throws Exception {
        MockHttpSession session = loginAsAdmin();
        UUID sentinelRoomId = sentinelRoomId();

        mockMvc.perform(get("/api/admin/rooms").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[*].id").value(not(hasItem(sentinelRoomId.toString()))));

        mockMvc.perform(get("/api/public/rooms"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].id").value(not(hasItem(sentinelRoomId.toString()))));

        mockMvc.perform(get("/api/admin/rooms/{roomId}/deletion-check", sentinelRoomId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletable").value(false))
            .andExpect(jsonPath("$.blockers[*].code").value(hasItem("SENTINEL_ROOM_PROTECTED")));

        mockMvc.perform(delete("/api/admin/rooms/{roomId}", sentinelRoomId).session(session))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ROOM_DELETE_BLOCKED"))
            .andExpect(jsonPath("$.details.blockers[*].code").value(hasItem("SENTINEL_ROOM_PROTECTED")));
    }

    @Test
    void duplicateRoomNameFailsWithConflict() throws Exception {
        MockHttpSession session = loginAsAdmin();
        createRoom(session, "testing-room-duplicate-a");

        mockMvc.perform(post("/api/admin/rooms")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "testing-room-duplicate-a",
                      "location": "Annex 2F",
                      "capacity": 12,
                      "description": "Duplicate",
                      "enabled": true
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ROOM_NAME_DUPLICATED"));
    }

    private UUID createRoom(MockHttpSession session, String name) throws Exception {
        String response = mockMvc.perform(post("/api/admin/rooms")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "%s",
                      "location": "Annex 1F",
                      "capacity": 20,
                      "description": "Test room",
                      "enabled": true
                    }
                    """.formatted(name)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return UUID.fromString(json.get("id").asText());
    }

    private UUID sentinelRoomId() {
        return jdbcTemplate.queryForObject(
            "select id from rooms where system_reserved = true and deleted_at is null",
            UUID.class
        );
    }

    private MockHttpSession loginAsAdmin() throws Exception {
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
}
