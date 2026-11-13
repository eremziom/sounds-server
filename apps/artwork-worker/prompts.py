"""Carry shared authoring concerns into prompts according to operation scope."""


def compose_prompt(prompt, brief, editing=False):
    if editing:
        # The existing composition is the reference. Repeating a generation
        # brief here can cause the model to replace the selected material.
        return prompt + (
            '\nThis is a local appearance edit of the provided image. Preserve its exact '
            'composition, camera, object geometry, silhouettes, texture and positions. '
            'Change only what the request names. Do not create a new scene or add objects. '
            'Preserve existing material-integrated light details, saturated longitudinal '
            'color gradients, distinct lamps, dark gaps and precise contours. Retain '
            'existing moving elements, their clean revealed backing and occlusion, '
            'and compatibility with separate visibility/influence/delay masks, '
            'independent lights during environmental blackout and smooth reveal. '
            'Do not add decorative light dots or lines.'
        )
    return prompt + (
        '\nLayered animation artwork: preserve integrated material detail and precise boundaries; '
        'many distributed material lights, strong longitudinal color gradients, independent lit regions '
        'during full environmental blackout and smooth reveal; separate visibility/influence/delay/occlusion '
        'masks; an integral moving object, clean revealed background and room for its planned trajectory. '
        'No detached decorative light dots or lines. Follow the composition and motion in this brief: '
        + brief['composition'] + ' ' + brief['motionPlan'] + ' ' + brief['lightingPlan'] + ' ' + brief['blackoutPlan']
    )
