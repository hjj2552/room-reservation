package com.school.reservation.domain.reservation;

import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.equalTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class PublicReservationIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void createPublicReservationSucceeds() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        OffsetDateTime endAt = startAt.plusHours(1);

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt, endAt)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id", notNullValue()))
            .andExpect(jsonPath("$.status").value("REQUESTED"));
    }

    @Test
    void createPublicReservationFailsWhenRequestedReservationAlreadyExists() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(12, 0);
        OffsetDateTime endAt = startAt.plusHours(1);

        createPublicReservation(startAt, endAt, "First public request");

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Second Public User",
                      "applicantEmail": "second-public@example.com",
                      "applicantPhone": "010-0000-0001",
                      "purpose": "Overlapping study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt.plusMinutes(30), endAt.plusMinutes(30))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));
    }

    @Test
    void createPublicReservationFailsWhenConfirmedReservationAlreadyExists() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime startAt = nextWeekdayAt(13, 0);
        OffsetDateTime endAt = startAt.plusHours(1);

        mockMvc.perform(post("/api/admin/reservations")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Admin User",
                      "applicantEmail": "admin-user@example.com",
                      "applicantPhone": "010-1111-1111",
                      "purpose": "Confirmed meeting",
                      "startAt": "%s",
                      "endAt": "%s",
                      "status": "CONFIRMED",
                      "memo": "created in public reservation conflict test"
                    }
                    """.formatted(testRoomId(), startAt, endAt)))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public-conflict@example.com",
                      "applicantPhone": "010-0000-0002",
                      "purpose": "Overlapping study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt.plusMinutes(30), endAt)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));
    }

    @Test
    void createPublicReservationFailsWhenReservationDisabled() throws Exception {
        jdbcTemplate.update("update operation_settings set reservation_enabled = false where id = 1");
        OffsetDateTime startAt = nextWeekdayAt(10, 0);

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("RESERVATION_DISABLED"));
    }

    @Test
    void publicCanReadDetailAndCancelWithPasswordOnly() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(14, 0);
        UUID reservationId = createPublicReservationAndReturnId(startAt, startAt.plusHours(1), "Public cancel");

        String hash = jdbcTemplate.queryForObject(
            "select cancel_password_hash from reservations where id = ?",
            String.class,
            reservationId
        );
        assertThat(hash).isNotBlank();
        assertThat(hash).isNotEqualTo("test-password");

        mockMvc.perform(get("/api/public/reservations/{reservationId}", reservationId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.applicantName").value("P*r"))
            .andExpect(jsonPath("$.applicantEmail").value("pu***********@example.com"))
            .andExpect(jsonPath("$.applicantPhone").value("0100******0"))
            .andExpect(jsonPath("$.cancellable").value(true));

        mockMvc.perform(post("/api/public/reservations/{reservationId}/cancel", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "wrong-password"
                    }
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("PUBLIC_CANCEL_PASSWORD_MISMATCH"));

        mockMvc.perform(post("/api/public/reservations/{reservationId}/cancel", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "test-password"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"))
            .andExpect(jsonPath("$.cancellable").value(false));
    }

    @Test
    void publicCanEditRequestedReservationAndStatusStaysRequested() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(9, 0);
        OffsetDateTime updatedStartAt = nextWeekdayAt(10, 0);
        UUID reservationId = createPublicReservationAndReturnId(startAt, startAt.plusHours(1), "Public edit requested");

        mockMvc.perform(post("/api/public/reservations/{reservationId}/edit", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "test-password"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.applicantEmail").value("public-cancel@example.com"))
            .andExpect(jsonPath("$.editable").value(true));

        mockMvc.perform(put("/api/public/reservations/{reservationId}", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public Edited User",
                      "applicantEmail": "public-edited@example.com",
                      "applicantPhone": "010-1234-5678",
                      "purpose": "Edited requested purpose",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), updatedStartAt, updatedStartAt.plusHours(1))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.purpose").value("Edited requested purpose"));

        String status = jdbcTemplate.queryForObject(
            "select status from reservations where id = ?",
            String.class,
            reservationId
        );
        assertThat(status).isEqualTo("REQUESTED");

        String afterStatus = jdbcTemplate.queryForObject(
            "select after_status from reservation_histories where reservation_id = ? order by created_at desc limit 1",
            String.class,
            reservationId
        );
        assertThat(afterStatus).isEqualTo("REQUESTED");
    }

    @Test
    void publicEditingConfirmedStatusReservationChangesItBackToRequestedStatus() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(11, 0);
        OffsetDateTime updatedStartAt = nextWeekdayAt(12, 0);
        UUID reservationId = createPublicReservationAndReturnId(startAt, startAt.plusHours(1), "Public edit confirmed status");
        approveReservation(reservationId);

        mockMvc.perform(put("/api/public/reservations/{reservationId}", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public Confirmed Status Edited User",
                      "applicantEmail": "public-confirmed-status-edited@example.com",
                      "applicantPhone": "010-2222-3333",
                      "purpose": "Edited confirmed status purpose",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), updatedStartAt, updatedStartAt.plusHours(1))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.purpose").value("Edited confirmed status purpose"));

        String status = jdbcTemplate.queryForObject(
            "select status from reservations where id = ?",
            String.class,
            reservationId
        );
        assertThat(status).isEqualTo("REQUESTED");

        java.util.Map<String, Object> history = jdbcTemplate.queryForMap(
            "select action, before_status, after_status, actor_type from reservation_histories where reservation_id = ? order by created_at desc limit 1",
            reservationId
        );
        assertThat(history.get("action")).isEqualTo("UPDATED");
        assertThat(history.get("before_status")).isEqualTo("CONFIRMED");
        assertThat(history.get("after_status")).isEqualTo("REQUESTED");
        assertThat(history.get("actor_type")).isEqualTo("PUBLIC_USER");
    }

    @Test
    void publicEditingConfirmedStatusReservationRunsConflictCheckBeforeSaving() throws Exception {
        MockHttpSession session = loginAsAdmin();
        OffsetDateTime originalStartAt = nextWeekdayAt(9, 0);
        OffsetDateTime conflictingStartAt = nextWeekdayAt(13, 0);
        UUID reservationId = createPublicReservationAndReturnId(originalStartAt, originalStartAt.plusHours(1), "Public edit confirmed status conflict");
        approveReservation(reservationId);
        createAdminReservation(
            session,
            testRoomId(),
            "Admin Conflict User",
            "admin-conflict@example.com",
            conflictingStartAt,
            conflictingStartAt.plusHours(1),
            "Confirmed status conflict"
        );

        mockMvc.perform(put("/api/public/reservations/{reservationId}", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public Conflict User",
                      "applicantEmail": "public-conflict-edit@example.com",
                      "applicantPhone": "010-4444-5555",
                      "purpose": "Should not be saved",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), conflictingStartAt.plusMinutes(30), conflictingStartAt.plusHours(1))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));

        java.util.Map<String, Object> reservation = jdbcTemplate.queryForMap(
            "select status, purpose from reservations where id = ?",
            reservationId
        );
        assertThat(reservation.get("status")).isEqualTo("CONFIRMED");
        assertThat(reservation.get("purpose")).isEqualTo("Public edit confirmed status conflict");
    }

    @Test
    void publicCannotEditCancelledReservation() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(15, 0);
        UUID reservationId = createPublicReservationAndReturnId(startAt, startAt.plusHours(1), "Public edit cancelled");

        mockMvc.perform(post("/api/public/reservations/{reservationId}/cancel", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "test-password"
                    }
                    """))
            .andExpect(status().isOk());

        mockMvc.perform(post("/api/public/reservations/{reservationId}/edit", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "cancelPassword": "test-password"
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mockMvc.perform(put("/api/public/reservations/{reservationId}", reservationId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public Cancelled User",
                      "applicantEmail": "public-cancelled-edit@example.com",
                      "applicantPhone": "010-6666-7777",
                      "purpose": "Should not be saved",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), startAt.plusHours(1), startAt.plusHours(2))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private void createPublicReservation(OffsetDateTime startAt, OffsetDateTime endAt, String purpose) throws Exception {
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), purpose, startAt, endAt)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"));
    }

    private UUID createPublicReservationAndReturnId(OffsetDateTime startAt, OffsetDateTime endAt, String purpose) throws Exception {
        String response = mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public-cancel@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "%s",
                      "startAt": "%s",
                      "endAt": "%s",
                      "cancelPassword": "test-password"
                    }
                    """.formatted(testRoomId(), purpose, startAt, endAt)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andReturn()
            .getResponse()
            .getContentAsString();

        return UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(response).get("id").asText());
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

    private void approveReservation(UUID reservationId) throws Exception {
        mockMvc.perform(post("/api/admin/reservations/{reservationId}/approve", reservationId)
                .session(loginAsAdmin())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "memo": "approve for public edit test"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }
}
