package com.school.reservation.domain.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

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
                .content(updateBody(version, "Updated Reservation Notice", 30)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.publicNotice").value("Updated Reservation Notice"))
            .andExpect(jsonPath("$.version").value((int) version + 1));
    }

    @Test
    void settingsContractsExcludeAdminContactNameAndExposePublicContactDetails() throws Exception {
        MockHttpSession session = loginAsAdmin();
        jdbcTemplate.update(
            "update operation_settings set admin_contact_email = ?, admin_contact_phone = ? where id = 1",
            "contact@example.test",
            "02-1234-5678"
        );

        mockMvc.perform(get("/api/admin/settings").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.adminContactName").doesNotExist())
            .andExpect(jsonPath("$.adminContactEmail").value("contact@example.test"))
            .andExpect(jsonPath("$.adminContactPhone").value("02-1234-5678"));

        mockMvc.perform(get("/api/public/settings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.adminContactName").doesNotExist())
            .andExpect(jsonPath("$.adminContactEmail").value("contact@example.test"))
            .andExpect(jsonPath("$.adminContactPhone").value("02-1234-5678"));

        Integer columnCount = jdbcTemplate.queryForObject(
            """
                select count(*)
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'operation_settings'
                  and column_name = 'admin_contact_name'
                """,
            Integer.class
        );
        assertThat(columnCount).isZero();
    }

    @Test
    void adminCanSetFiveMinuteReservationSlots() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Five minute slots", 5)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slotMinutes").value(5));
    }

    @Test
    void reservationDurationSettingsMustMatchUpdatedSlotMinutes() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid min duration", 5, 31, 240)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid min duration", 10, 35, 240)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Valid updated slot", 5, 35, 240)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slotMinutes").value(5))
            .andExpect(jsonPath("$.minReservationMinutes").value(35));
    }

    @Test
    void operatingHoursMustMatchUpdatedSlotMinutes() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid open time", 5, 30, 240, "09:31", "18:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid open time", 10, 30, 240, "09:35", "18:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Valid updated open time", 5, 30, 240, "09:35", "18:00")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slotMinutes").value(5))
            .andExpect(jsonPath("$.openTime").value("09:35:00"));
    }

    @Test
    void minimumReservationDurationMustFitOperatingHours() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid operating window", 30, 120, 240, "09:00", "10:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void staleSettingsVersionFailsWithConflict() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "First update", 30)))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Stale update", 30)))
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

    private String updateBody(long version, String notice, int slotMinutes) {
        return updateBody(version, notice, slotMinutes, 30, 240);
    }

    private String updateBody(long version, String notice, int slotMinutes, int minReservationMinutes, int maxReservationMinutes) {
        return updateBody(version, notice, slotMinutes, minReservationMinutes, maxReservationMinutes, "09:00", "18:00");
    }

    private String updateBody(
        long version,
        String notice,
        int slotMinutes,
        int minReservationMinutes,
        int maxReservationMinutes,
        String openTime,
        String closeTime
    ) {
        return """
            {
              "organizationName": "Room Reservation",
              "publicNotice": "%s",
              "reservationEnabled": true,
              "reservationDisabledMessage": "Reservation is currently disabled.",
              "semesterStartDate": "2026-01-01",
              "semesterEndDate": "2026-12-31",
              "openTime": "%s",
              "closeTime": "%s",
              "slotMinutes": %d,
              "availableDaysOfWeek": ["MON", "TUE", "WED", "THU", "FRI"],
              "minReservationMinutes": %d,
              "maxReservationMinutes": %d,
              "adminContactEmail": "admin@example.edu",
              "adminContactPhone": "02-0000-0000",
              "completionMessage": "Done",
              "version": %d
            }
            """.formatted(notice, openTime, closeTime, slotMinutes, minReservationMinutes, maxReservationMinutes, version);
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
