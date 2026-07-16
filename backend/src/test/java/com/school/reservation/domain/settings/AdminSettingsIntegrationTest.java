package com.school.reservation.domain.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    void settingsContractsExcludeRemovedFieldsAndExposePublicContactDetails() throws Exception {
        MockHttpSession session = loginAsAdmin();
        jdbcTemplate.update(
            "update operation_settings set admin_contact_email = ?, admin_contact_phone = ? where id = 1",
            "contact@example.test",
            "02-1234-5678"
        );

        mockMvc.perform(get("/api/admin/settings").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.adminContactName").doesNotExist())
            .andExpect(jsonPath("$.logoUrl").doesNotExist())
            .andExpect(jsonPath("$.adminContactEmail").value("contact@example.test"))
            .andExpect(jsonPath("$.adminContactPhone").value("02-1234-5678"));

        mockMvc.perform(get("/api/public/settings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.adminContactName").doesNotExist())
            .andExpect(jsonPath("$.logoUrl").doesNotExist())
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

        Integer logoColumnCount = jdbcTemplate.queryForObject(
            """
                select count(*)
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'operation_settings'
                  and column_name = 'logo_url'
                """,
            Integer.class
        );
        assertThat(logoColumnCount).isZero();
    }

    @Test
    void settingsAlwaysExposeFixedFiveMinuteCompatibilityValue() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Legacy client value is ignored", 30)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slotMinutes").value(5));
    }

    @Test
    void databaseStillRejectsUnsupportedCompatibilityValue() {
        assertThatThrownBy(() -> jdbcTemplate.update("update operation_settings set slot_minutes = 60 where id = 1"))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbcTemplate.update("update operation_settings set min_reservation_minutes = 25 where id = 1"))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbcTemplate.update("update operation_settings set max_reservation_minutes = 241 where id = 1"))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void reservationDurationSettingsUseFixedFiveMinuteIncrementsAndThirtyMinuteMinimum() throws Exception {
        MockHttpSession session = loginAsAdmin();
        for (int invalidMin : new int[] { 25, 31 }) {
            long version = currentSettingsVersion(session);
            mockMvc.perform(put("/api/admin/settings")
                    .session(session)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateBody(version, "Invalid min duration", 5, invalidMin, 240)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }

        for (int validMin : new int[] { 30, 35, 45, 60 }) {
            long version = currentSettingsVersion(session);
            mockMvc.perform(put("/api/admin/settings")
                    .session(session)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateBody(version, "Valid fixed increment", 30, validMin, 240)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slotMinutes").value(5))
                .andExpect(jsonPath("$.minReservationMinutes").value(validMin));
        }

        long version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid max increment", 5, 30, 241)))
            .andExpect(status().isBadRequest());

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Max below min", 5, 60, 55)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void operatingHoursUseThirtyMinuteGridInsteadOfSlotMinutes() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid open time", 5, 30, 240, "09:15", "18:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Valid grid-aligned open time", 5, 30, 240, "09:30", "18:00")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slotMinutes").value(5))
            .andExpect(jsonPath("$.openTime").value("09:30:00"));
    }

    @Test
    void operatingHoursRejectSecondsAndFractionalSeconds() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid seconds", 30, 30, 240, "09:00:01", "18:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        version = currentSettingsVersion(session);
        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid nanos", 30, 30, 240, "09:00:00.000000001", "18:00")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void invalidDurationUpdateLeavesPreviousSettingsUnchanged() throws Exception {
        MockHttpSession session = loginAsAdmin();
        long version = currentSettingsVersion(session);

        mockMvc.perform(put("/api/admin/settings")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content(updateBody(version, "Invalid duration", 5, 25, 240)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        mockMvc.perform(get("/api/admin/settings").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.minReservationMinutes").value(30))
            .andExpect(jsonPath("$.maxReservationMinutes").value(240))
            .andExpect(jsonPath("$.version").value((int) version));
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
