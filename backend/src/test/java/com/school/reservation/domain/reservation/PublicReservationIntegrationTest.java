package com.school.reservation.domain.reservation;

import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.equalTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
                    """.formatted(firstRoomId(), startAt, endAt)))
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
                    """.formatted(firstRoomId(), startAt.plusMinutes(30), endAt.plusMinutes(30))))
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
                    """.formatted(firstRoomId(), startAt, endAt)))
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
                    """.formatted(firstRoomId(), startAt.plusMinutes(30), endAt)))
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
                    """.formatted(firstRoomId(), startAt, startAt.plusHours(1))))
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
                    """.formatted(firstRoomId(), purpose, startAt, endAt)))
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
                    """.formatted(firstRoomId(), purpose, startAt, endAt)))
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
}
