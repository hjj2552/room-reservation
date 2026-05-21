package com.school.reservation.domain.reservation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PublicAvailabilityIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void availabilityReturnsTrueWhenSlotIsOpen() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(14, 0);

        mockMvc.perform(get("/api/public/availability")
                .param("roomId", firstRoomId().toString())
                .param("startAt", startAt.toString())
                .param("endAt", startAt.plusHours(1).toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void availabilityReturnsFalseWhenSlotConflicts() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(15, 0);
        createPublicReservation(startAt);

        mockMvc.perform(get("/api/public/availability")
                .param("roomId", firstRoomId().toString())
                .param("startAt", startAt.toString())
                .param("endAt", startAt.plusHours(1).toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.available").value(false))
            .andExpect(jsonPath("$.reason").value("TIME_SLOT_CONFLICT"));
    }

    private void createPublicReservation(OffsetDateTime startAt) throws Exception {
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "availability@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s"
                    }
                    """.formatted(firstRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated());
    }
}

