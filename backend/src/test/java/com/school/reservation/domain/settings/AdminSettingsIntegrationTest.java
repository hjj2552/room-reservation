package com.school.reservation.domain.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class AdminSettingsIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanGetAndUpdateSettings() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Updated Reservation Notice")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publicNotice").value("Updated Reservation Notice"))
            .andExpect(jsonPath("$.version").value((int) version + 1));
    }

    @Test
    void staleSettingsVersionFailsWithConflict() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "First update")))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Stale update")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("VERSION_CONFLICT"));
    }

    private long currentSettingsVersion(MockHttpSession session) throws Exception {
        String response = mockMvc.perform(get("/api/admin/settings").session(session))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.get("version").asLong();
    }

    private String updateBody(long version, String notice) {
        return """
            {
              "organizationName": "Room Reservation",
              "publicNotice": "%s",
              "reservationEnabled": true,
              "reservationDisabledMessage": "Reservation is currently disabled.",
              "semesterStartDate": "2026-01-01",
              "semesterEndDate": "2026-12-31",
              "openTime": "09:00",
              "closeTime": "18:00",
              "slotMinutes": 30,
              "availableDaysOfWeek": ["MON", "TUE", "WED", "THU", "FRI"],
              "minReservationMinutes": 30,
              "maxReservationMinutes": 240,
              "requirePhone": true,
              "adminContactName": "Admin",
              "adminContactEmail": "admin@example.edu",
              "adminContactPhone": "02-0000-0000",
              "completionMessage": "Done",
              "version": %d
            }
            """.formatted(notice, version);
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

