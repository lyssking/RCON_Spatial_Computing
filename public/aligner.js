window.alignSceneToPoints = function (livePoints, referencePoints, targetEntity) {
    if (!livePoints || !referencePoints || livePoints.length < 3 || referencePoints.length < 3) {
        console.warn("[SPATIAL ALIGNER] At least 3 points are required for alignment.");
        return;
    }

    try {
        // Parse incoming coordinates to THREE.Vector3
        const pLive = livePoints.map(p => new THREE.Vector3(parseFloat(p.x), parseFloat(p.y), parseFloat(p.z)));
        const pRef = referencePoints.map(p => new THREE.Vector3(parseFloat(p.x), parseFloat(p.y), parseFloat(p.z)));

        // 1. Align origin translation using Point 1 (Carpet Corner)
        const liveOrigin = pLive[0].clone();
        const refOrigin = pRef[0].clone();

        // 2. Compute direction vectors relative to origin (Primary axis: Point 1 -> Point 2)
        const dirLiveX = new THREE.Vector3().subVectors(pLive[1], liveOrigin).normalize();
        const dirRefX = new THREE.Vector3().subVectors(pRef[1], refOrigin).normalize();

        // 3. Compute plane normal vectors (Secondary axis: Point 1 -> Point 3)
        const dirLive3 = new THREE.Vector3().subVectors(pLive[2], liveOrigin).normalize();
        const dirRef3 = new THREE.Vector3().subVectors(pRef[2], refOrigin).normalize();

        const normalLive = new THREE.Vector3().crossVectors(dirLiveX, dirLive3).normalize();
        const normalRef = new THREE.Vector3().crossVectors(dirRefX, dirRef3).normalize();

        // 4. Compute orthogonal Z basis vectors
        const dirLiveY = new THREE.Vector3().crossVectors(normalLive, dirLiveX).normalize();
        const dirRefY = new THREE.Vector3().crossVectors(normalRef, dirRefX).normalize();

        // 5. Construct rotation matrices from orthogonal basis vectors
        const mLive = new THREE.Matrix4().set(
            dirLiveX.x, dirLiveY.x, normalLive.x, 0,
            dirLiveX.y, dirLiveY.y, normalLive.y, 0,
            dirLiveX.z, dirLiveY.z, normalLive.z, 0,
            0, 0, 0, 1
        );

        const mRef = new THREE.Matrix4().set(
            dirRefX.x, dirRefY.x, normalRef.x, 0,
            dirRefX.y, dirRefY.y, normalRef.y, 0,
            dirRefX.z, dirRefY.z, normalRef.z, 0,
            0, 0, 0, 1
        );

        // 6. Compute relative rotation (Ref * Inverse(Live))
        const mLiveInv = new THREE.Matrix4().copy(mLive).invert();
        const mRotation = new THREE.Matrix4().multiplyMatrices(mRef, mLiveInv);

        const quaternion = new THREE.Quaternion().setFromRotationMatrix(mRotation);

        // 7. Calculate translation offset to align live space to reference space
        const rotatedLiveOrigin = liveOrigin.clone().applyQuaternion(quaternion);
        const translation = refOrigin.clone().sub(rotatedLiveOrigin);

        // 8. Apply transformation to target A-Frame entity
        targetEntity.object3D.position.copy(translation);
        targetEntity.object3D.quaternion.copy(quaternion);
        targetEntity.object3D.updateMatrixWorld(true);

        console.log("[ALIGNMENT SUCCESS] Transform Matrix applied successfully:", {
            position: targetEntity.object3D.position,
            rotation: targetEntity.object3D.rotation
        });

    } catch (err) {
        console.error("[ALIGNMENT ERROR] Failed to calculate matrix alignment:", err);
    }
};