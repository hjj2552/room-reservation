package com.school.reservation.domain.tag;

import com.school.reservation.domain.tag.dto.request.TagRequest;
import com.school.reservation.global.exception.ApiConflictException;
import jakarta.persistence.EntityNotFoundException;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TagService {

    private final TagRepository tagRepository;

    public TagService(TagRepository tagRepository) {
        this.tagRepository = tagRepository;
    }

    @Transactional(readOnly = true)
    public Page<Tag> search(String keyword, Pageable pageable) {
        if (keyword == null || keyword.isBlank()) {
            return tagRepository.findAll(pageable);
        }
        return tagRepository.findByNameContainingIgnoreCase(keyword.trim(), pageable);
    }

    @Transactional
    public Tag create(TagRequest request) {
        String name = request.name().trim();
        if (tagRepository.existsByNameIgnoreCase(name)) {
            throw duplicateName(name);
        }
        return tagRepository.save(new Tag(name, request.color()));
    }

    @Transactional
    public Tag update(UUID tagId, TagRequest request) {
        Tag tag = getOrThrow(tagId);
        String name = request.name().trim();
        if (tagRepository.existsByNameIgnoreCaseAndIdNot(name, tagId)) {
            throw duplicateName(name);
        }
        tag.update(name, request.color());
        return tag;
    }

    @Transactional
    public void delete(UUID tagId) {
        Tag tag = getOrThrow(tagId);
        tagRepository.delete(tag);
    }

    @Transactional(readOnly = true)
    public Tag getOrThrow(UUID tagId) {
        return tagRepository.findById(tagId)
            .orElseThrow(() -> new EntityNotFoundException("Tag not found."));
    }

    private ApiConflictException duplicateName(String name) {
        return new ApiConflictException(
            "TAG_NAME_DUPLICATED",
            "Tag name already exists.",
            Map.of("name", name)
        );
    }
}
