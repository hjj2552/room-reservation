package com.school.reservation.domain.tag;

import com.school.reservation.domain.tag.dto.request.TagRequest;
import com.school.reservation.domain.tag.dto.response.TagResponse;
import com.school.reservation.global.dto.PagedResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/tags")
public class AdminTagController {

    private final TagService tagService;

    public AdminTagController(TagService tagService) {
        this.tagService = tagService;
    }

    @GetMapping
    public PagedResponse<TagResponse> getTags(
        @RequestParam(required = false) String keyword,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        return PagedResponse.from(tagService
            .search(keyword, PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "name")))
            .map(TagResponse::from));
    }

    @PostMapping
    public ResponseEntity<TagResponse> create(@Valid @RequestBody TagRequest request) {
        Tag tag = tagService.create(request);
        return ResponseEntity.created(URI.create("/api/admin/tags/" + tag.getId()))
            .body(TagResponse.from(tag));
    }

    @PutMapping("/{tagId}")
    public TagResponse update(@PathVariable UUID tagId, @Valid @RequestBody TagRequest request) {
        return TagResponse.from(tagService.update(tagId, request));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Void> delete(@PathVariable UUID tagId) {
        tagService.delete(tagId);
        return ResponseEntity.noContent().build();
    }
}
