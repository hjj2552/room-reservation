package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class ReservationConflictServiceTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void duplicateTimeSlotFailsWithConflict() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(11, 0);
        OffsetDateTime endAt = startAt.plusHours(1);

        String body = """
            {
              "roomId": "%s",
              "applicantName": "Public User",
              "applicantEmail": "public@example.com",
              "applicantPhone": "010-0000-0000",
              "purpose": "Study",
              "startAt": "%s",
              "endAt": "%s"
            }
            """.formatted(firstRoomId(), startAt, endAt);

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TIME_SLOT_CONFLICT"));
    }
}
