package com.school.reservation.domain.room;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PublicRoomQueryIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void publicCanGetRoomDetail() throws Exception {
        mockMvc.perform(get("/api/public/rooms/{roomId}", firstRoomId()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(firstRoomId().toString()));
    }

    @Test
    void disabledRoomIsBlockedFromPublicDetail() throws Exception {
        UUID roomId = firstRoomId();
        jdbcTemplate.update("update rooms set enabled = false where id = ?", roomId);

        mockMvc.perform(get("/api/public/rooms/{roomId}", roomId))
            .andExpect(status().isNotFound());
    }

    @Test
    void publicCanGetWeeklyReservationsWithoutPersonalData() throws Exception {
        OffsetDateTime startAt = nextWeekdayAt(10, 0);
        createPublicReservation(startAt);

        mockMvc.perform(get("/api/public/rooms/{roomId}/weekly-reservations", firstRoomId())
                .param("weekStart", startAt.toLocalDate().toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.room.id").value(firstRoomId().toString()))
            .andExpect(jsonPath("$.reservations[0].purpose").value("Study"));
    }

    private void createPublicReservation(OffsetDateTime startAt) throws Exception {
        mockMvc.perform(post("/api/public/reservations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "roomId": "%s",
                      "applicantName": "Public User",
                      "applicantEmail": "public-query@example.com",
                      "applicantPhone": "010-0000-0000",
                      "purpose": "Study",
                      "startAt": "%s",
                      "endAt": "%s"
                    }
                    """.formatted(firstRoomId(), startAt, startAt.plusHours(1))))
            .andExpect(status().isCreated());
    }
}
