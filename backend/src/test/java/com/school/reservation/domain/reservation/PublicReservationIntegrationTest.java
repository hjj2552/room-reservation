package com.school.reservation.domain.reservation;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
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
                      "endAt": "%s"
                    }
                    """.formatted(firstRoomId(), startAt, endAt)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id", notNullValue()))
            .andExpect(jsonPath("$.status").value("REQUESTED"));
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
                      "endAt": "%s"
                    }
                    """.formatted(firstRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("RESERVATION_DISABLED"));
    }
}

