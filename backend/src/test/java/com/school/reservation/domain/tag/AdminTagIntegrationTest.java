package com.school.reservation.domain.tag;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

class AdminTagIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanCreateListAndUpdateTags() throws Exception {
        MockHttpSession session = loginAdminSession();

        UUID tagId = createTag(session, "Grade 1", "#2563eb");

        mockMvc.perform(get("/api/admin/tags")
                .session(session)
                .param("keyword", "grade")
                .param("page", "0")
                .param("size", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalItems").value(1))
            .andExpect(jsonPath("$.items[0].id").value(tagId.toString()))
            .andExpect(jsonPath("$.items[0].name").value("Grade 1"))
            .andExpect(jsonPath("$.items[0].color").value("#2563eb"));

        mockMvc.perform(put("/api/admin/tags/{tagId}", tagId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Grade 1 Updated",
                      "color": "#16a34a"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(tagId.toString()))
            .andExpect(jsonPath("$.name").value("Grade 1 Updated"))
            .andExpect(jsonPath("$.color").value("#16a34a"));
    }

    @Test
    void duplicateTagNameFailsOnCreateAndUpdate() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID firstTagId = createTag(session, "Duplicate Tag", "#2563eb");
        UUID secondTagId = createTag(session, "Another Tag", "#16a34a");

        mockMvc.perform(post("/api/admin/tags")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "duplicate tag",
                      "color": "#dc2626"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TAG_NAME_DUPLICATED"));

        mockMvc.perform(put("/api/admin/tags/{tagId}", secondTagId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Duplicate Tag",
                      "color": "#dc2626"
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("TAG_NAME_DUPLICATED"));

        mockMvc.perform(get("/api/admin/tags").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[*].id").value(hasItem(firstTagId.toString())))
            .andExpect(jsonPath("$.items[*].id").value(hasItem(secondTagId.toString())));
    }

    @Test
    void deletingTagHardDeletesAndClearsRecurrenceReference() throws Exception {
        MockHttpSession session = loginAdminSession();
        UUID tagId = createTag(session, "Temporary Tag", "#2563eb");
        UUID recurrenceId = UUID.randomUUID();

        jdbcTemplate.update(
            """
                insert into reservation_recurrences (
                  id,
                  room_id,
                  tag_id,
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
                values (?, ?, ?, 'Recurring User', 'recurring-tag-delete@example.com', '010-0000-0000', 'Tagged recurring reservation', current_date, current_date + interval '14 days', 'MON', '10:00', '11:00', 'SKIP_CONFLICTS'::recurrence_conflict_policy)
                """,
            recurrenceId,
            testRoomId(),
            tagId
        );

        mockMvc.perform(delete("/api/admin/tags/{tagId}", tagId).session(session))
            .andExpect(status().isNoContent());

        Integer tagCount = jdbcTemplate.queryForObject(
            "select count(*) from tags where id = ?",
            Integer.class,
            tagId
        );
        UUID recurrenceTagId = jdbcTemplate.queryForObject(
            "select tag_id from reservation_recurrences where id = ?",
            UUID.class,
            recurrenceId
        );

        assertThat(tagCount).isZero();
        assertThat(recurrenceTagId).isNull();
    }

    private UUID createTag(MockHttpSession session, String name, String color) throws Exception {
        String response = mockMvc.perform(post("/api/admin/tags")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "%s",
                      "color": "%s"
                    }
                    """.formatted(name, color)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value(name))
            .andExpect(jsonPath("$.color").value(color))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return UUID.fromString(json.get("id").asText());
    }
}
