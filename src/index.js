import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { ReflectorForSSRPass } from 'three/addons/objects/ReflectorForSSRPass.js';


import { MeshBVH, MeshBVHUniformStruct, BVHShaderGLSL, SAH } from 'three-mesh-bvh';

let scene, camera, renderer, controls;
let gltfLoader;
let diamondModel;
const selects = [];
let gui;
const params = {
    enableSSR: true,
    autoRotate: true,
    otherMeshes: true,
    groundReflector: true,
};
let composer;
let ssrPass;
let groundReflector;

const bloomParams = {
    threshold: 0.75,
    strength: 0.8,
    radius: 0,
    exposure: 1
};
const diamondParams = {

	color: '#ffffff',
	bounces: 3.0,
	ior: 2.4,
	aberrationStrength: 0.01,
	fastChroma: false,
	animate: true,

};


function initScene()
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0.1, 0.1, 0.1);

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = bloomParams.exposure;
    document.body.appendChild( renderer.domElement );
    window.addEventListener('resize', onWindowResize, false)
    initControls();
    downloadModel();
}
function initControls()
{
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)
    controls.minPolarAngle = THREE.MathUtils.DEG2RAD * 15;
    controls.maxPolarAngle = THREE.MathUtils.DEG2RAD * 75;
}
function downloadModel()
{
    gltfLoader = new GLTFLoader()
    gltfLoader.load(
        'assets/DiamondRing.glb',
        (object) => {
            diamondModel = object.scene;
            diamondModel.position.set(0, 0, 0);
            scene.add(diamondModel)
            selects.push(diamondModel);
            createDiamondMaterial();
            initPostProcessing();
        },
        (xhr) => {},
        (error) => {
            console.log(error)
        }
    )
}
function initPostProcessing()
{
    let geometry, material, mesh;
    geometry = new THREE.PlaneGeometry( 5, 5 );
    groundReflector = new ReflectorForSSRPass( geometry, {
        clipBias: 0.0003,
        textureWidth: window.innerWidth,
        textureHeight: window.innerHeight,
        color: 0x888888,
        useDepthTexture: true,
    } );
    groundReflector.material.depthWrite = false;
    groundReflector.rotation.x = - Math.PI / 2;
    groundReflector.visible = false;
    scene.add( groundReflector );

    composer = new EffectComposer( renderer );
    ssrPass = new SSRPass( {
        renderer,
        scene,
        camera,
        width: innerWidth,
        height: innerHeight,
        groundReflector: params.groundReflector ? groundReflector : null,
        selects: params.groundReflector ? selects : null
    } );


    ssrPass.thickness = 0.018;
    ssrPass.infiniteThick = false;
    ssrPass.maxDistance = .65;
    groundReflector.maxDistance = ssrPass.maxDistance;

    ssrPass.opacity = 1;
    ssrPass._bouncing = true;
    groundReflector.opacity = ssrPass.opacity;

    composer.addPass( ssrPass );


    let bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    bloomPass.threshold = bloomParams.threshold;
    bloomPass.strength = bloomParams.strength;
    bloomPass.radius = bloomParams.radius;
    composer.addPass( bloomPass );

    animate();
}
async function createDiamondMaterial()
{
    const environmentPromise = new RGBELoader()
		.loadAsync( 'assets/reflection.hdr' );

    let environment = await environmentPromise;
    environment.mapping = THREE.EquirectangularReflectionMapping;
	environment.generateMipmaps = true;
	environment.minFilter = THREE.LinearMipmapLinearFilter;
	environment.magFilter = THREE.LinearFilter;
    scene.envMap = environment;

    diamondModel.traverse(obj => {
        if(obj.name == "Diamond")
        {
            const bvh = new MeshBVH( obj.geometry, { strategy: SAH, maxLeafTris: 1 } );
            var diamondMaterial = getDiamondShader(environment);
            diamondMaterial.uniforms.bvh.value.updateFrom( bvh );
            diamondMaterial.uniforms.bounces.value = 5;
            obj.material = diamondMaterial;
        }
        else if(obj.name == "GEMS")
        {
            const bvh = new MeshBVH( obj.geometry, { strategy: SAH, maxLeafTris: 1 } );
            var diamondMaterial = getDiamondShader(environment);
            diamondMaterial.uniforms.bvh.value.updateFrom( bvh );
            diamondMaterial.uniforms.bounces.value = 2;
            obj.material = diamondMaterial;   
        }
        else if(obj.material != undefined)
            obj.material.envMap = environment;
    })
}
function getDiamondShader(environment)
{
    // initialize the diamond material
	let diamondMaterial = new THREE.ShaderMaterial( {
		uniforms: {

			// scene / geometry information
			envMap: { value: environment },
			bvh: { value: new MeshBVHUniformStruct() },
			projectionMatrixInv: { value: camera.projectionMatrixInverse },
			viewMatrixInv: { value: camera.matrixWorld },
			resolution: { value: new THREE.Vector2() },

			// internal reflection settings
			bounces: { value: 3 },
			ior: { value: 2.4 },

			// chroma and color settings
			color: { value: new THREE.Color( 1, 1, 1 ) },
			fastChroma: { value: false },
			aberrationStrength: { value: 0.01 },

		},
		vertexShader: /*glsl*/ `
			varying vec3 vWorldPosition;
			varying vec3 vNormal;
			uniform mat4 viewMatrixInv;
			void main() {

				vWorldPosition = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
				vNormal = ( viewMatrixInv * vec4( normalMatrix * normal, 0.0 ) ).xyz;
				gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position , 1.0 );

			}
		`,
		fragmentShader: /*glsl*/ `
			#define RAY_OFFSET 0.001

			#include <common>
			precision highp isampler2D;
			precision highp usampler2D;

			${ BVHShaderGLSL.common_functions }
			${ BVHShaderGLSL.bvh_struct_definitions }
			${ BVHShaderGLSL.bvh_ray_functions }

			varying vec3 vWorldPosition;
			varying vec3 vNormal;

			uniform sampler2D envMap;
			uniform float bounces;
			uniform BVH bvh;
			uniform float ior;
			uniform vec3 color;
			uniform bool fastChroma;
			uniform mat4 projectionMatrixInv;
			uniform mat4 viewMatrixInv;
			uniform mat4 modelMatrix;
			uniform vec2 resolution;
			uniform float aberrationStrength;

			#include <cube_uv_reflection_fragment>

			// performs an iterative bounce lookup modeling internal reflection and returns
			// a final ray direction.
			vec3 totalInternalReflection( vec3 incomingOrigin, vec3 incomingDirection, vec3 normal, float ior, mat4 modelMatrixInverse ) {

				vec3 rayOrigin = incomingOrigin;
				vec3 rayDirection = incomingDirection;

				// refract the ray direction on the way into the diamond and adjust offset from
				// the diamond surface for raytracing
				rayDirection = refract( rayDirection, normal, 1.0 / ior );
				rayOrigin = vWorldPosition + rayDirection * RAY_OFFSET;

				// transform the ray into the local coordinates of the model
				rayOrigin = ( modelMatrixInverse * vec4( rayOrigin, 1.0 ) ).xyz;
				rayDirection = normalize( ( modelMatrixInverse * vec4( rayDirection, 0.0 ) ).xyz );

				// perform multiple ray casts
				for( float i = 0.0; i < bounces; i ++ ) {

					// results
					uvec4 faceIndices = uvec4( 0u );
					vec3 faceNormal = vec3( 0.0, 0.0, 1.0 );
					vec3 barycoord = vec3( 0.0 );
					float side = 1.0;
					float dist = 0.0;

					// perform the raycast
					// the diamond is a water tight model so we assume we always hit a surface
					bvhIntersectFirstHit( bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist );

					// derive the new ray origin from the hit results
					vec3 hitPos = rayOrigin + rayDirection * dist;

					// if we don't internally reflect then end the ray tracing and sample
					vec3 refractedDirection = refract( rayDirection, faceNormal, ior );
					bool totalInternalReflection = length( refract( rayDirection, faceNormal, ior ) ) == 0.0;
					if ( ! totalInternalReflection ) {

						rayDirection = refractedDirection;
						break;

					}

					// otherwise reflect off the surface internally for another hit
					rayDirection = reflect( rayDirection, faceNormal );
					rayOrigin = hitPos + rayDirection * RAY_OFFSET;

				}

				// return the final ray direction in world space
				return normalize( ( modelMatrix * vec4( rayDirection, 0.0 ) ).xyz );
			}

			vec4 envSample( sampler2D envMap, vec3 rayDirection ) {

				vec2 uvv = equirectUv( rayDirection );
				return texture( envMap, uvv );

			}

			void main() {

				mat4 modelMatrixInverse = inverse( modelMatrix );
				vec2 uv = gl_FragCoord.xy / resolution;

				vec3 normal = vNormal;
				vec3 rayOrigin = cameraPosition;
				vec3 rayDirection = normalize( vWorldPosition - cameraPosition );

				if ( aberrationStrength != 0.0 ) {

					// perform chromatic aberration lookups
					vec3 rayDirectionG = totalInternalReflection( rayOrigin, rayDirection, normal, max( ior, 1.0 ), modelMatrixInverse );
					vec3 rayDirectionR, rayDirectionB;

					if ( fastChroma ) {

						// fast chroma does a quick uv offset on lookup
						rayDirectionR = normalize( rayDirectionG + 1.0 * vec3( aberrationStrength / 2.0 ) );
						rayDirectionB = normalize( rayDirectionG - 1.0 * vec3( aberrationStrength / 2.0 ) );

					} else {

						// compared to a proper ray trace of diffracted rays
						float iorR = max( ior * ( 1.0 - aberrationStrength ), 1.0 );
						float iorB = max( ior * ( 1.0 + aberrationStrength ), 1.0 );
						rayDirectionR = totalInternalReflection(
							rayOrigin, rayDirection, normal,
							iorR, modelMatrixInverse
						);
						rayDirectionB = totalInternalReflection(
							rayOrigin, rayDirection, normal,
							iorB, modelMatrixInverse
						);

					}

					// get the color lookup
					float r = envSample( envMap, rayDirectionR ).r;
					float g = envSample( envMap, rayDirectionG ).g;
					float b = envSample( envMap, rayDirectionB ).b;
					gl_FragColor.rgb = vec3( r, g, b ) * color;
					gl_FragColor.a = 1.0;

				} else {

					// no chromatic aberration lookups
					rayDirection = totalInternalReflection( rayOrigin, rayDirection, normal, max( ior, 1.0 ), modelMatrixInverse );
					gl_FragColor.rgb = envSample( envMap, rayDirection ).rgb * color;
					gl_FragColor.a = 1.0;

				}

				#include <tonemapping_fragment>
				#include <encodings_fragment>

			}
		`
	} );
    return diamondMaterial;
}
function onWindowResize() {


    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );
    composer.setSize( window.innerWidth, window.innerHeight );
    groundReflector.getRenderTarget().setSize( window.innerWidth, window.innerHeight );
    groundReflector.resolution.set( window.innerWidth, window.innerHeight );
    render()
}
function animate() {
    requestAnimationFrame(animate)

    controls.update()

    render()
}

function render() {
    composer.render();
}
initScene();